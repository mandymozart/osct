# Project Memory – OSCT

Decisions and context that are not obvious from the code. Newest first.
Add new entries at the top with a date. Tick `[x]` open items when resolved and note the
outcome in the line (or move it into a dated decision block).

## 2026-10-31 – plugin API 1.6: GPU feedback buffers, the demo's ink painting (#225)

- **The engine owns the renderer; a plugin asks for a buffer.** `api.feedback` (engine/src/scene/feedback.ts) instead of
  raw renderer access: the engine keeps the ping-pong targets and steps every live buffer once per drawn frame in
  `ArView`'s loop, before `draw` (not in `draw` itself – `sample()` and `resize()` draw extra frames and would step twice).
  Creation order is step order, so an Image pass made after its Buffer A reads A's new frame. One target, no ping-pong,
  when the pass does not read `"self"`.
- **Ownership by build scope**: a buffer made inside a node type's / material's `build` or a component's `apply`
  (`collectFeedbacks`) belongs to that node – live only while it and every parent are visible up to the scene (the
  anchor is hidden when a target is lost; another spread's nodes are disposed), disposed with the node. Made in
  `register`, it belongs to the plugin and goes on uninstall. No hook in `ArScene` was needed.
- **Precision**: `half` by default (WebGL2 renders into it with `EXT_color_buffer_float` or `_half_float`), `float` on
  request (also needs `OES_texture_float_linear` for linear filtering), else `byte` with one warning. The view hands the
  renderer to the module at once (`setFeedbackRenderer`) so a buffer gets its type when made; one made earlier falls back
  at its first step and gets new targets (why `uniform` exists: it follows).
- **Not recorded.** A buffer has no type and no spec – it is no registration. The recording run checks the options and
  returns a dummy; `registered`, the guard, the server (`Plugins::REGISTERS` scans `register…("type")` calls only) and the
  MCP content model's registrations stay as they were (the MCP texts mention the two functions). Schema 2.20 only because
  `PLUGIN_API_VERSION` lives in shared/ (as 2.18 for `loadText`).
- **Shadertoy adapter**: `api.shadertoy(source)` appends a `main` that calls `mainImage(c, vUv * iResolution.xy)` –
  `vUv * iResolution` is the pixel centre, Shadertoy's `fragCoord`. three.js compiles every `ShaderMaterial` as GLSL ES
  3.0 with `gl_FragColor` defined, so no `glslVersion: GLSL3` (that would drop the `pc_fragColor` define).
- **The shader** (XlsBDf by trapcode, Tilman: Shadertoy's default CC BY-NC-SA 3.0 applies) is not stable on its own: at
  60 fps its velocity saturates after 50–100 s without any input and the field breaks into stripes (measured: mean |v|²
  0.38 at 3 000 steps, 22 at 12 000). A friction of `dt * 0.01` per step keeps it calm for 400 s with a tap every few
  seconds (0.1). The tap's swirl draws the velocity towards a whirl (`mix`) instead of adding – the first version added
  and blew up after a few taps. Both marked `demo:` in the plugin.
- **Placement**: page 6 (*The switch* – interaction), under the screen, x 70 y 205 width 85 mm; the target picture is a
  CPU port of the passes run 1 500 frames in a drawn frame (made in the worker's temp folder, not in the repository).
- **Frame cost** (desktop, RTX 2070 SUPER, 300 synced steps): 0.023 ms at 256², 0.05 ms at 512², 0.17 ms at 1024²; 0.013 ms
  main thread. The S22 was not connected – the phone figure in docs/plugins.md is an estimate (open item below).
- [ ] Measure the ink painting on the S22 at 256 and 512 (#225).
- Found in passing: `scripts/test/plugins.test.ts` deletes `client/public/assets/content/plugins/tint` after its run, so
  a demo build served from that folder loses its `tint` until it is built again.

## 2026-10-31 – no Stage tab: the spread in the Inspector, the preview settings in the toolbar (#229)

- **Tilman decided** (on a screenshot, the tree's spread row and the Stage tab: "These are the same. I'd like to remove
  Stage from the right side."). It supersedes #227's "the spread lives in one place: the Stage panel's spread section".
  The Stage panel's removal is his decision (RULES #1); its sections moved, none was dropped.
- **The Entity tab is the Inspector.** It shows whatever is selected – the spread, an entry, a target, its entity, a
  node – so *Entity* no longer fit. *Inspector* over *Selected*: the word every 3D and design tool uses for that panel
  (Unity, Godot, Xcode), a noun like the other tabs; the phone shows the sliders icon. The component keeps its name
  (`EntityPanel.svelte`) – a rename would only churn the files #223's entry form touches; the tab's id is `inspector`
  (`panel-tabs.ts`), a stored `stage` or `entity` maps to it.
- **The spread's sections moved, not rebuilt**: `StagePanel.svelte` became `SpreadView.svelte` (git mv) minus its *stage*
  section; the Inspector shows it while the spread is selected. The section ids stay `stage.spread`, `stage.passes`,
  `stage.narrative`, so everyone's open / closed state carries over; *spread* is now open on a first visit.
- **Nothing selected is the spread** (`settledSelection`): the fallback "a target stands in" and `selection.cleared` are
  gone; a fresh workspace, another spread and a click on the stage that picks nothing select the spread. The Inspector's
  `selected` is no longer bound back – the panel never writes the selection's target itself.
- **The preview settings are the toolbar's *view* group** (`ViewMenu.svelte`, the gear) after *grid & snap*: shake,
  origin, top, sky. *View*, not *Stage*: the toolbar already is the stage's. The grid stays *grid & snap*'s (it was in
  both). Both one-button groups share `ToolMenu.svelte` (button, panel, keys) – #190's pattern built once. `stageSummary`
  became `viewSummary`, the group's tooltip, without the grid (grid & snap's own tooltip says it).
- **The selection bug in the screenshot** (spread row not highlighted, gizmo still on the model): with the demo on
  1.51.2 – a node selected in the tree or on the stage, then the spread row – the row is highlighted and the gizmo goes,
  so the logic was right. The screenshot's state is exactly 1.51.1's (the spread row was a plain row with no handler);
  the editor never reloads itself on a deploy (`version.pollInterval: 0`, #160 reloads only on a missing chunk), so a
  tab opened before 1.51.2 reached staging (22:40 UTC, the issue 23:59) keeps the old tree. What 1.51.2 still missed: a
  click on the row's book icon or its empty cells did nothing – now a tap anywhere on a row selects it. Not verified on
  staging (no staging sign-in for workers).
- [ ] The demo book in the local SQLite is older than `fixtures/demo` (the key has the `key` component, no behaviour, no
  aquarium): the tutorial's `12-behaviour.webp` (the behaviour line in the timeline) still shows the Stage tab – retake
  it after re-importing the demo. The demo's own texts (entry bodies, the layout image) still say "Entity panel" /
  "Stage panel" – content, changed with the next demo edit.

## 2026-10-31 – the demo aquarium's water is Splash in WebGPU, the heightfield its fallback (#228)

- **Tilman decided** (#228): "The water simulation you used is shit. Use this: https://github.com/matsuoka-601/Splash
  for the demo." Splash (MIT, Masaya Matsuoka) is adapted into `fixtures/demo/plugins/aquarium/index.ts` – its MLS-MPM
  compute shaders (clear grid, P2G ×2, grid update, G2P) and its screen-space renderer (depth splats, the narrow-range
  filter, thickness + gaussian, the composite); dropped: the particle/shadow mode (density grid, ray marching), the
  cube map and floor (2 MB of PNGs), the mouse, `copyPosition` (the render passes read the particle struct), the
  pipeline overrides (WGSL consts), the camera and lil-gui. Licence text and author in the file's header and in
  `fixtures/demo/DEMO.md`. Bundle 28.7 → 72.2 KB (8.5 → 20.1 KB gzipped).
- **The issue's sketch held**, no plugin API change: a WebGPU device of the plugin's own, an off-DOM canvas, the camera
  from the water mesh's `onBeforeRender`, a `CanvasTexture` the `water` material samples in screen space on the front
  faces of a box as large as the inside. The canvas upload happens in the same draw (the WebGPU work is submitted in
  `onBeforeRender`, `needsUpdate` set, three uploads when the water draws), so the fluid is not a frame behind. Measured
  on the desktop (headless Edge, NVIDIA Turing): 60 fps, 1–1.3 ms GPU and ~0.2 ms of hand-off per frame at 10k–40k. The
  S22 (WebGPU on Android Chrome) is not measured yet – the issue's checklist keeps that item.
- **Compositing with alpha, not refraction**: Splash refracts a background it renders itself; the scene behind is
  three.js's, so the fluid shader writes how much of what lies behind the water hides (absorption by thickness,
  fresnel against a procedural room, a highlight), premultiplied and gamma-encoded in the 8-bit canvas
  (`premultiplyAlpha` keeps the bytes; the material divides and decodes). The absorption is 0.12, not Splash's 0.7
  (at the tank's depth 0.7 hides the fish), capped so the floor's caustics always show; the fresnel reflection only
  where the surface meets the air (a normal facing up). The toy's body hides the water behind it by a ray–ellipsoid
  test in the fluid shader (WebGPU knows no WebGL depth); its fins are not tested – an ellipsoid for the tail cut a
  hole beside it.
- **Second pass after the orchestrator's review** (the first shots: a frayed outline, water standing off the glass and
  poking past it, a wobbly top, milky): Splash's soft walls replaced by hard ones – the inside IS the domain (three
  cells of grid around it), the grid lets no water out through a wall, particles keep 0.3 cells off it; calibrating
  around the soft walls (the first version) could not make the water meet the glass. The grid keeps 99.5 % of its
  motion per step (the surface settles between the dips). **Water against glass is drawn from a heightfield, not from
  the splats**: a compute pass takes the highest particle per column of cells, averaged over its neighbours; the
  composite draws flat water where a ray enters the glass below it (a straight waterline, square corners) and Splash's
  free surface elsewhere – trimmed where only beyond the inside, faded where its grains stand above the column height
  at the glass and, softly, where thin (blurred thickness). A count-based height (particles per column / density) was
  tried first: particles pile at the hard walls, so the wall columns read far too high. Splats 2.2 cells wide, the
  filter's reach 20 (Splash: 1.2, 12) – a smoother surface. Settled density 3.9 (read back), level 95–102 %.
- **"The Entity panel shows which path runs" without an API change**: the `webgpu` row's spec label is changed by the
  plugin once it knows (*WebGPU ok* / *no WebGPU*; *WebGPU* until a tank asked) – the registry keeps the spec object the
  plugin registered (`recorded.test.ts` pins that identity) and the panel reads it when it shows the node. A row the
  panel shows open while the label changes updates with the next selection. A proper per-node status would be an API
  addition (e.g. a `status` on the node type's instance) – not made, per the brief.
- **`splash` reused for the fluid**: it scales the toy's push on the way in (rising, the toy moves at its own speed –
  the gain on the way up dragged a water column after it).
- [ ] The S22: frame cost of the fluid with WebGPU on Android Chrome, and the canvas upload there (#228's checklist).

## 2026-10-30 – the tree's spread and entry rows select (#227)

- **The spread lives in one place: the Stage panel's *spread* section.** A tap on the spread row selects the spread,
  opens the Stage tab and that section and scrolls it into view. Rejected: a spread view in the Entity panel's place –
  the Stage panel already holds the spread's format (its one control) and its passes (the post-processing section right
  below), so a second view would show the same control twice. The Entity panel names a selected spread with *settings*
  to the section.
- **An entry is a selection of its own** (`selection.entry`, `selection.spread` beside target / node; the rows' rules in
  `editor/src/lib/tree-rows.ts`). An entry with a target also sets `selection.target` to it with `onTarget`, so the
  stage outlines its print exactly as for a selected target – no second outline path. The Entity panel's fallback (a
  target standing in while nothing is selected) is off while the spread or an entry is selected.
- **The entry view is its own component** (`EntryView.svelte`, the words in `entry-view.ts`), in the Entity panel's
  place, read-only: #223's entry form replaces its rows in the same place and order. The body uses the reader's
  paragraph rule (blank lines), copied as a pure helper – the editor never imports the reader (RULES #32). A link's
  URL is a link only over http(s).
- **Delete on an entry row opens #198's confirmation** (the same as *Remove target*; `removeEntry(entryId, targetId)`
  on the page now takes an entry without a target too). The spread row has no menu and Delete does nothing on it or
  on a target row, as before.
- `Selection.up()` spread `this` into `parentSelection`, which copies none of a class's `$state` accessors; it now
  passes a plain snapshot.

## 2026-10-30 – one desk on the stage: the Eiermann frame with two tops; Schöpfer's desk removed (#226)

- **Tilman decided** (#226, on a screenshot of Schöpfer's drawers hanging open beside its frame): "only one type of
  table – the Eiermann, with two types of plates. The blue linoleum one is nice but don't use the trays. Just the top,
  linoleum on oak, and switching the preview switches only the plate." The removal of Schöpfer's desk (#187's model,
  its id, its build) is his decision – RULES #1 is satisfied by it.
- **One GLB, two top meshes** (`TopEiermann`, `TopLinoleum`, plus `Frame`) rather than a frame and two top files: one
  request, one load, a switch is `visible` on two nodes – nothing reloads and nothing can arrive out of order.
  `desk-eiermann.glb` keeps its name.
- **The setting is `top`: `plywood` | `linoleum`** (the UI's *top* row, a segmented control), not *Eiermann* |
  *linoleum*: the desk is always the Eiermann, so the head reads *Eiermann · plywood* / *Eiermann · linoleum*. A stored
  `desk` from before maps `eiermann` → `plywood`, `schoepfer` → `linoleum` (`storedTop` in `preview.ts`); the next
  write drops the old key.
- **The linoleum top is 20 mm**: 2 mm linoleum on an 18 mm board, so its edge shows one whole stack of 13 plies like the
  plywood top's (13 per 18 mm, #107) with the linoleum as a thin line above; the surface and the outer size are the
  plywood top's, only the underside is 2 mm lower (the frame's inner tubes end inside the board, unseen). Its plies are
  the plywood top's texture tinted to oak (`oak_edge`), its underside the oak veneer (`oak.ts`).

## 2026-10-30 – the browser session in an HttpOnly cookie, CSRF token on writes (#207)

- **Tilman decided** (#207, of the four options: separate admin session, HttpOnly cookie, plugin sandbox, documented
  acceptance): "the token in an HttpOnly cookie (SameSite, CSRF token)". Built in `Auth.php`; how it works is
  `docs/server.md` "Sessions, cookies and CSRF"; the rule is RULES #34.
- **Browser vs. non-browser sign-in: an explicit body field** `"session": "cookie"` on `/auth/verify` and
  `/auth/password`. Rejected: guessing a browser from `Sec-Fetch-*` / `Origin` – reader apps from before #207 still cached
  as a PWA would then get a cookie and no `session` in the answer and fail their sign-in. Without the field the API
  answers the Bearer token as before (MCP `sign_in_verify`, scripts, old apps).
- **One cookie `osct_session` for the reader and the editor**: same origin, same accounts, same sessions table – separate
  cookies would isolate nothing (a script on either page can use both) and need a client marker on every request. The
  consequence: one sign-in per browser for the site; a sign-in in the reader replaces the editor's session and the other
  way round (the old row is deleted). The editor notices a cookie that changed hands on its next write (403 `csrf` →
  `GET /user` → another email → its session ends) – Tilman testing a reader account and an admin account side by side
  now needs two browser profiles.
- **SameSite=Strict**, not Lax: every request needing the session is a same-origin `fetch`; the mail link opens the
  reader page, which confirms with a `fetch`. **Path=/api** (the API base) so the pages never send it. **Secure** unless
  `ENV=local` over plain http. Max-Age = SESSION_TTL_DAYS, renewed with `last_used_at` (hourly).
- **CSRF token = HMAC(SECRET, "csrf:" + session row id)**, base64url – stateless, bound to the session, survives the
  exchange's token rotation (same row). Checked in `Auth::signedIn()` for cookie requests with POST/PUT/PATCH/DELETE, so
  every route is covered without a per-route call; `Sec-Fetch-Site` other than `same-origin` → 403 `csrf` too (SameSite
  treats sibling subdomains as same-site). The clients keep it in memory and renew it once from `GET /user` on a 403
  `csrf` (the reader after an offline start, either app after the other replaced the cookie).
- **Logout by cookie needs the CSRF token** like any write (kept simple and uniform; the clients always hold it). A
  cookie of a session that is gone is cleared with the 401.
- **Plainly, for the record:** the cookie stops the session from being read and taken away. It does **not** sandbox
  plugin code: a book's plugin in the editor (or the reader's AR scene) runs in the site's origin and can still send
  requests with the cookie – and fetch the CSRF token from `GET /user` – while the page is open. The sandbox (opaque-
  origin iframe or worker) is the orchestrator's to raise with Tilman as a follow-up.
- [ ] Open: **remove the token exchange** (`POST /auth/cookie`, `Auth::exchange`, the editor's `exchangeStoredToken` and
  `LEGACY_TOKEN_KEY`, the reader's `StoredSession.session` / `exchangeStoredToken` and `canSync`'s check) a few releases
  after #207 is on production – once browsers signed in before have started once. Keep the Bearer session answer for
  non-browser sign-ins (MCP).

## 2026-10-30 – engine cleanup: one behaviour vocabulary, no reader traces, AR errors as codes (#213)

- **The vocabulary lives in `shared/types/behaviour.ts` only**: `plugin-runtime.ts` aliases `VAR_SCOPES`, `VarScope`,
  `VarValue`, `EVENT_NAME_PATTERN` and `CORE_EVENTS` to the shared `BEHAVIOUR_*` definitions; `CoreEvents` (the
  payloads) stays in the engine, and its type makes `CORE_EVENTS` a type error when the shared list and the payloads
  name different events. Chosen so that `shared/` stays untouched – **no schema bump**, the lock is unchanged.
  Rejected: moving the definitions into the engine (the content guard in `shared/` needs them) or re-exporting the
  runtime's from `shared/` (a checksum change for nothing). The editor's `subtreeNames` / `pathOfName` read the
  engine's `namedPaths` (`@engine/scene/behaviour`). The generated `plugin-api.d.ts` now spells `VarValue` /
  `VarScope` as the shared aliases – same types.
- **RULES #32 traces gone**: the engine reads no `import.meta.env` (the 8th Wall files' base is `ImageTracker`'s third
  argument and `prefetchXr8(base)`; the look-around's debug handle follows `ArSceneOptions.debug`), touches no reader
  element (the `scanning` event of `ArSceneEvents`; `<ar-bridge>` toggles `#osct-scanning` and hides it on disconnect,
  because it stops listening before the scene's teardown) and reads no storage (`engine/src/utils/device-storage.ts`:
  `setDeviceStorage`, the engine's keys without prefix; the reader's `LocalDeviceStorage` and the editor's
  `deviceStorage` map them to the old `osct-<key>` names, so stored switches stay). The editor passes the same debug
  flag and storage as the reader; it never had the scanning element. Side effect: the look-around's debug code is no
  longer removed from production bundles at build time – it is in the AR chunk and stays off (`debug` false).
- **Errors as codes (RULES #16)**: `ErrorInfo.code` is `ErrorCode`. The 16 members nothing raised are gone
  (`NOT_FOUND`, `NAVIGATION_FAILED`, `TIMEOUT`, the `SPREAD_*`, `IMAGE_TARGET_NOT_FOUND`, `ENTITY_LOAD_FAILED`, the
  `ASSET_*`, the `SCENE_*`, `FAILED_TO_UPDATE_SCENE`, `CAMERA_PERMISSION_DENIED`) – this supersedes the "keep – part
  of a phase" list of the 2026-09-24 audit below: a code comes back with the code that raises it (the loading concept
  review in PLAN.md, `*_NOT_READY`, would add its own). New: `PROGRESS_CONVERTED` / `PROGRESS_RESET` (the strings
  `HistoryManager` already used), `AR_LOAD_FAILED`, `AR_START_FAILED`, `CAMERA_NOT_RESPONDING`, `AR_FAILED`
  (`ArErrorCode`). The scene's `status` event carries an `ArError { code, message }`; the tracker and the scene throw
  `ArSceneError`. The `CAMERA_NOT_RESPONDING` text marker in `types/scene.ts` is gone. No new i18n keys: AR errors show
  as the camera overlay's existing texts, the progress notices keep `progress:converted` / `progress:reset`. The 8th
  Wall pipeline's listeners are typed per event (`XrEventDetails`, `XrListener` in `xr8.ts`).
- [ ] Open: `shared/types/behaviour.ts` still says of `BEHAVIOUR_SCOPES` and `BEHAVIOUR_CORE_EVENTS` that "a test keeps
  them equal" with the runtime's – now they are the runtime's (the test checks identity). Reword with the next schema
  bump that touches `shared/types/` (a comment alone would need one, RULES #10).

## 2026-10-30 – one place for the API's types and rules; the PHP's copies pinned (#210 #217)

- **Where the API's types live: `shared/api/`** (#210). `editor.ts` – the answers of `/api/editor/*`, matched field by
  field against `server/api/src/*.php`; `errors.ts` – the error shape (`apiErrorFields`) and the two-step confirmations
  (`confirmationStep`, import and removal); `rules.ts` – the API's rules its TypeScript callers share (`ID_PATTERN`,
  `ENV_NAME`, `ASSET_KINDS` and their extensions, `PLUGIN_REGISTER_FUNCTIONS` and the scanner `pluginTypes`). The
  editor (`api.ts` re-exports the types it uses), the MCP server and the osct CLI (`ENV_NAME`) import them; no copies
  left in `editor/src/lib/api.ts`, `mcp/src/content.ts`, `mcp/src/model.ts` or `scripts/src/lib/content-sync.ts`.
- **`shared/api/` is outside the content schema lock** (RULES #10): the lock hashed every file of `shared/`, so a new
  folder there would have needed a schema bump for types that are no content. `hashContract` now skips `api/`
  (`SHARED_API_DIR`, a scripts test proves a file there leaves the checksum alone); the checksum of the rest is
  unchanged – no bump, no new lock. Rejected: a top-level folder of its own (new aliases and tsconfig paths in four
  packages for the same result).
- **Type corrections against the PHP** (#210): `BookSummary` – `book`, `initialSpreadId`, `schema`, `assetsBase`
  (string, "" = none), `importedHash`, `createdAt`, `live`, `lastPublish` always sent; `listBooks().environments`
  required, and `EnvironmentServing` is `{ env, book, build, since }` or `{ env, error }`; the tree has `unassigned`,
  an entry's `target` is `TargetData | null`; `PublishResult.store` and `.replaced` required; `ImportResult` has
  `counts` and `draft`, `imported` required; `IncomingBuild` is no `ImportedBuild` (no importedAt / By, `schema` and
  `source` never null); `PluginSource` has no `usages` (`Plugins::summary` sends none – the editor typed it as the
  list's); `RemovalImpact` is a union by `kind`; `putEntity` answers `{ ref, entity }`, `putTarget` / `putSpread`
  the whole `TargetData` / `SpreadData` (were `unknown`). MCP: `list_assets`' `kind` enum had `model`, which no asset
  has (`Assets::KINDS`: glb / gltf) – now the API's kinds; `list_books` dropped `environments` although its
  description names them – passed on now.
- **The cache of the book's tree** (#210): `getBook` keeps one promise per book until a write to it – any non-GET to
  `/editor/books/{id}/…` through `request`, answered or refused – a failed read, a new token, or `{ fresh: true }`
  (the book page on opening, so it still sees what others changed). Its three readers kept their part per book
  already (the stage's `assetsBase`, the environment, the top bar's title) – the cache only makes them share one read;
  the stage's draft is not the tree and is still loaded on every spread.
- **`errorText`** (`api.ts`) is the one error line: the API's message (`{ code: true }` adds the code), an `Error`'s
  message, else the value as text. A plain `Error` once shown as `String(e)` ("Error: …") now reads as its message.
- **The pinning test** (#217): `mcp/test/php-rules.test.ts` runs PHP over the API's classes (autoloaded as
  `index.php` does) and compares each constant with `shared/`; the scanner by behaviour (`Plugins::registers` and
  `pluginTypes` on the same sources). `Editor::print`'s surfaces became `Editor::PRINT_SURFACES` to be pinned. No
  difference found. It replaces the scripts test that compared `ContentStore::ENV` by regex. In `mcp/` because CI's
  MCP job has PHP; skipped without it, as the e2e test.
- **Publish refusals** (#217): `result.ts` `PUBLISH_REFUSALS` lists what `Books::publish` (with `Auth::refuseToken`
  and the content store) refuses with; a test checks that each has a hint and that the publish tool's description
  names it.

## 2026-10-30 – editor cleanup: no paths for older APIs, controls built once, one number parser (#211 #212)

- **No compatibility paths for an older API (#211, RULES #10)**: editor and API ship in one image, so the editor no
  longer guesses what an older server answers. Checked against the PHP before removing: `POST …/spreads` takes
  `format: "spread"` (`Books::FORMATS`), so `isAddRefused` and the book page's "New spreads come in with an import"
  are gone; both DELETEs without `confirm` always answer 409 `confirm-delete` (`Confirmation::require` throws for a
  null `confirm`), so the book page and the workspace no longer treat a resolved first call as "removed at once";
  `GET /health` always sends `env` (`Config::env()`, `local` by default, valid by the environment-name rule), so
  `Health.env` is required and the MCP guide's server name is `osct-<env>` – `osct-…` until `/health` answers,
  no host-derived name. Nothing else in `editor/src` was labelled as being for an older server. Left alone: the
  server's `role` field (open item below) and the loose optional response fields in `api.ts` such as
  `listBooks().environments?` – they are #210's (one place for the response types).
- **Controls built once (#212, RULES #32)**: the admin page's filter is `Segmented` (which got an optional `label`
  for its group's accessible name); the tree's row menu is `ContextMenu` with `menuTrigger` – right click, long
  press, and the menu key / Shift+F10 on the tree for the selected row (the tree keeps its own focus, so the tree's
  key handler opens it at the selected row's name). Every action stays (Move up / down, Into the node above, Out of
  its parent, Remove node / entity, Remove target); `MenuItem.keys` shows each move's shortcut at the right, a move
  that cannot be made is disabled with its reason, and "shows what goes" moved into the item's help. While a
  `ContextMenu` is open it owns the keys (it stops their propagation): before, ← → in the stage's menu also stepped
  to another spread and Delete reached the workspace's shortcut.
- **CSS comments (#212, RULES #22)**: 71 → 28 in `editor/src` – labels dropped, the kept ones are one line each and
  guard a rule that would otherwise be "fixed" wrongly (or describe the file, as `app.css`'s head does).
- **One number parser (#212)**: `parseNumber` (`values.ts`) for every `ScrubNumber` and a behaviour rule's value.
  Decision: a comma or a dot is the decimal point (`1,5` = 1.5 – a German keyboard), **no exponent** (`1e3` is no
  number: a number field refuses it, a rule's value keeps it as text) and no thousands separators. Why no exponent:
  nobody types scientific notation into mm, degrees or factors, and a rule's value field would otherwise turn the
  text `1e3` into 1000 behind the author's back; the fields themselves never show an exponent (`ScrubNumber` rounds
  to its decimals). Before, the number fields took both `1,5` and `1e3`, a rule's value neither (it kept them as
  text).

## 2026-10-30 – consent is the person's own: no account change through an AI token or an admin (#203)

- **Decision (Tilman, 2026-10-30):** "keine Einwilligung ändern per mcp. Das ist auch in der admin UI verboten weil user
  centric data." `PATCH /user` (`Users::update`) takes `Auth::session()` instead of `Auth::user()`: a token gets 403
  `not-for-ai` for the whole account update – options and language – like the password and the deletion. Rule:
  RULES #33.
- **Checked:** no `/admin/*` route writes options or language (`setRole` only roles; `makeEditor` creates a new user with
  every option off and language `en` – creating, not changing someone's consent; the list and the CSV only read). The
  MCP server has no tool that calls `PATCH /user` (`mcp/src` reads `GET /user` only); docs/mcp.md says so now.

## 2026-10-30 – server hardening: forwarded host headers, transactions in admin writes and assets (#209)

- **The public URL of stored files**: `Http::apiUrl()` takes `APP_URL`'s origin (+ the API's base) on every instance
  whose `ENV` is not `local`, and refuses with 500 `not-configured` when `APP_URL` is not set explicitly (the default
  `http://localhost:5173` never counts). A local instance keeps the request's host on purpose – there `APP_URL` names an
  app's dev server (Tilman's checkout: the editor on 5175, whose proxy rewrites the Host to 127.0.0.1:8080), and the API
  test sets `APP_URL=https://app.example` while fetching the stored URLs from the API it started. Staging and production
  set `OSCT_APP_URL` (`config/deploy.staging.yml`, `config/deploy.production.yml`; the FTPS workflow requires it in
  `server/deploy/write-config.php`). No new config key.
- **`Db::transaction` joins an open transaction** (`Roles::grant` runs inside sign-in's and `makeEditor`'s) and on
  SQLite starts `BEGIN IMMEDIATE` by hand (PDO's `beginTransaction` is deferred: two writers that read first deadlock),
  tracked by its own flag because PDO does not see a hand-written BEGIN. `Db::forUpdate()` is ` FOR UPDATE` on MySQL,
  nothing on SQLite; `Db::isDuplicate()` tells a unique-key error (MySQL 1062, SQLite 19 + UNIQUE / PRIMARY KEY).
- **Last admin**: `Roles::holders(admin, lock: true)` inside the revoke's transaction replaces `Roles::count` (no other
  user). **Grant**: the duplicate key of a parallel grant answers `changed: false`; the API test simulates the race with
  a trigger that raises the duplicate error (php -S serves one request at a time, so a real race cannot be tested).
- **Assets**: a replace writes its file inside the transaction, after locking the asset row – deleting the file of a
  failed replace while the lock is held cannot hit another replace's file at the same path. Every delete (not only a
  forced one) records a change `asset`, the same `before` as `Removal` (`Assets::before`, shared now); the book is not
  touched (its rows did not change).
- Left as is: deleting one's own account (`DELETE /user`) can still remove the last admin; `putEntity` already read
  inside its transaction and now locks too.

## 2026-10-30 – the review's fixes: import id, served assets, CSV button, session end, CLI (#204 #205 #206 #208 #215)

- **Import id (#204)**: the import compares the configuration's `book.id` with the path after the configuration's own
  checks (so a malformed configuration still answers its own 400 first) – 400 `invalid-configuration` naming both. The
  preview has no path id: it answers for the configuration's own id (400 `invalid-id` when that is no id, as the import
  now does too – before, the import took any string). The editor and the MCP server already send `incoming.book`.
- **Served assets (#205)**: `ContentStore::SERVED_ASSET` is built from `Editor::ID`; ids have no `.`, so no traversal.
- **CSV button (#206)**: *All* keeps *Users CSV* (docs/admin.md describes it; removing it would remove a feature),
  *Newsletter* has *Newsletter CSV*, *Editors* / *Admins* none. One pure function, `editor/src/lib/users-csv.ts`.
- **Session end (#208)**: `api()` (and the upload and CSV calls) end the session on a 401 only when the stored token
  was sent and is still the stored one (a sign-in meanwhile is left alone, parallel 401s end it once). The sign-in
  calls, the sign-out and `me()` pass `unauthorizedIsAnswer`: a wrong password is a form error, a stale token at
  startup signs out quietly; `restore(true)` of a signed-in user that answers 401 ends the session with the note. The
  engine's draft fetch (`authFetch`) does not end it by itself – `getBook` runs first and does.
- **One environment-name rule (#215)**: `[a-z][a-z0-9-]{0,31}` – `ContentStore::ENV` in PHP (Config::env, the publish
  check, the content route), `ENV_NAME` in `scripts/src/lib/content-sync.ts` for the CLI; a scripts test reads the PHP
  constant and compares. `Config::env()` used to accept a digit first: such an `ENV` now counts as `local` (no instance
  uses one). The MCP server's `publish` keeps its own copy of the regex (`mcp/src/content.ts`) – #217 pins the PHP copies.
- **Recording API typed (#215)**: `scripts/tsconfig.json` maps `@shared/*` and `three` like the plugin type check does,
  so the build's recording API is `PluginApi` from the engine – an engine API change fails the scripts' type check.
  `sha256` lives in `lib/storage.ts` (the Storage API's checksum format), the sync imports it. `messageOf` in
  `lib/errors.ts` turns any thrown value into text.

## 2026-10-30 – the second code review (#19, develop at 1.50.0)

- **Scope**: the editor, the engine, the MCP server, the API's new classes, `shared/` to 2.19, the CLI, `docs/` and
  `agents/`, with the first pass's rules (findings first, small behaviour-preserving cleanups in commits
  `Unreleased: …`, everything else proposed as issues – the orchestrator files them). Deploy config left out.
- **Fixed on the branch**: unused exports and props (editor, engine), types and helpers the editor wrote again
  (`PrintPlacement`, the surface and format unions, asset kinds, file size, dates, the admin-route test, the layout
  fetch), the content tooling's copies of `shared/` constants and of `isObject`, comments that told history (names,
  dates, quotes, "as before", dated research notes – now `docs/plugins.md`), the API's one hand-made 204 and the
  confirmation signature without the SECRET check, docs and RULES paths from before the engine.
- **Kept, not removed** (a reason each): the camera debug switches `cycleZoom` / `cameraSummary` (tested, tied to
  #37), `getContentBaseUrl` and the plugin registry readers (test seams), `ScrubNumber`'s `disabled` and
  `ColourPopover`'s `palette` (a control's generic props), the engine's own `isRecord` in `trigger-protocol.ts` (the
  content tooling compiles that file without the `@shared` alias), the duplicated re-exports of the reader's
  `ar-bridges` barrels (the dev tools import the group barrel, the bridge the utils barrel).
- **Nothing `shared/` was touched**: every change there bumps the schema; the shared findings wait for the next
  schema MINOR as one proposed issue.
- **Found, proposed** (not fixed – each changes behaviour): a token may change the account's update options
  (`PATCH /user`), an import's `book.id` is not compared with the path, the local store serves no assets of book ids
  with capitals or `_`, the admin page's CSV button follows every filter but *All*, book plugin code runs in the origin
  that holds the session token, unhandled rejections and mid-session 401s in the editor.

- [ ] Legacy kept for older data, to remove once no instance needs it (RULES #1/#15 – ask first): the `users.role`
  mirror and `GET /user`'s `role` field "for older readers" (`Roles.php`, `Users.php`; the column stays, RULES #25);
  `POST /admin/editors` "the older way to make an editor" (still in docs/editor.md); the one-time move out of
  `server/api/db/` (`Paths.php`, `index.php`); a `latest.json` without `book` (`ContentStore::live`); a book imported
  before `imported_json` (`Books::comparison`, `editsSince`); a declared plugin of a build without recorded specs
  (`Editor.php`, `Books::parse`).
- [x] Legacy in the editor: compatibility paths for an older API although both ship in one image (`isAddRefused`, the
  single-step deletes, `Health.env?`, the `mcp-setup.ts` host fallback) – removed in #211 (2026-10-30 entry above).
- [ ] `editor/package.json` carries 1.10.1 while the app is 1.50.x – RULES #10 does not list the editor (proposed).

## 2026-10-30 – the behaviour component: rules without code (#88, schema 2.19)

- **One component with a list of rules**, not one component per rule as the concept's Studio C sketched
  (`2026-10-28-entity-components.md`): a node carries at most one `behaviour` (the panel's *add component* allows one
  per type), its `rules: [{ on, when?, do }]`. The grammar lives in `shared/types/behaviour.ts` (checks, the reading
  into rules, the shortest written form) – one definition for the build, the guard, the engine, the editor and the MCP
  server. `behaviour` sits in `COMPONENTS` with no parameters; `componentProblems` hands its fields to
  `behaviourProblems`, the editor's `contentEntity` writes its rules instead of rows. No new parameter kind: that would
  have changed the plugin API's spec types for something only the built-in uses.
- **The verbs**: `play: <clip>` (+ `node`), `pause` / `stop` / `show` / `hide: <node name>`, `set: { name: value }` (+
  `scope`, spread by default like `api.vars.set`), `emit: <event>`; a bare word runs a verb on the own node. Nodes are
  named by their `name` (2.12), looked up in the behaviour node's subtree (first match) – a behaviour's reach is its
  subtree, which is what the entity builder has when the node is built. `stop` = seek 0 + pause (the timeline has no
  stop of its own). **Left out:** going to a scene of the `scenes` component (it is a plugin's, not built in – a rule
  can `emit` an event that plugin hears), open an entry or link (the engine knows no routes – RULES #32).
- **Events**: the node's `found`, `lost`, `tap`, `unlocked` (added to the brief's three: the first find was the key's
  old trigger, and the hook exists), and any other camelCase name from the bus – scene events and core events alike.
  A named-event rule fires whether or not its page is in view (visibility and variables are state).
- **Semantics**: on one event every rule's condition is read first, then the matching rules run in order (a toggle in
  two rules works). Emits nest synchronously; a chain is cut after 8 nested events (logged). An action that cannot run
  is logged once per message and skipped.
- **Runs on the plugin runtime**: each behaviour takes a `runtimeApi("behaviour:<target>")` – its sets, emits and
  listeners are a plugin's; its emit payload is `{ targetId, node? }`. The editor's log hears a rule that fired through
  `noteBehaviour` (observers only, pseudo-event `behaviour`), never the bus.
- **Declared variables left out**: `when` is robust without them – `null` tests "not set" and `{ not: v }` a
  difference, so "no key yet" is `{ hasKey: { not: true } }` or, as in the demo, a rule without a condition before the
  one with it. Types, defaults and write lists come with a work that needs them (the concept's `variables:` block).
  **Bubbling scopes** stay out too (one flat bus).
- **Compatibility**: MINOR (2.19) as asked, although a 2.18 guard refuses a node carrying `behaviour` (an unknown
  built-in type) – the same precedent as 2.17's `texture` kind: a book with behaviours needs a 2.19 app. The API needs no
  validation of its own (it validates no component's parameters); `Editor::COMPONENT_TYPES` lists it so the publish's
  `unknown-components` check does not take it for a plugin's.
- **The demo**: the narrative plugin's `key` component is replaced by the key's rule (tap: play `rattle`, set `hasKey`
  in the book, emit `keyRattled` – the key is now taken with a tap, as Tilman's request reads, no longer on the first
  find); the `animation` component stays with `playOn: never` (it says how the clip plays). The door model has no clip,
  so the door's rules show / hide its `hint` and emit `openDoor`; the `door` plugin keeps the lift-and-turn (what a rule
  cannot do) and opens on that event – it lost its own `hasKey` check and `api.vars.on("hasKey")`, so a `hasKey` set by
  hand opens the door at the next find, not at once. The `lamp` plugin stays as the `api.vars.on` example.
- **Editor**: the value fields take text (`true`, `false`, a number, else text; empty = null) with suggestions rather
  than a type picker per value – booleans are the common case; the condition's all/any shows from two tests on, the
  rows between read *and* / *or*. Save stays off while a rule is incomplete (the guard would refuse the book otherwise).
## 2026-10-30 – The demo aquarium's water: a CPU heightfield handed to the material through its uniforms (#202)

- **CPU, not GPU ping-pong.** The plugin API gives a plugin no renderer (no render targets, no `renderer.render`), so a
  GPU simulation would need an API change (RULES #10 bump) for a demo-only study – and the CPU version is not coarse:
  64 × 36 cells cost about 0.04 ms per frame on the desktop (0.14 ms at 96), the texture is 64 × 36 half floats.
- **The node type owns the simulation, the material reads it.** The tank knows the toy and the water's mesh; after the
  engine put the node's material on the water, the tank's `update` writes the heightfield and its size into that
  material's uniforms (`heightfield`, `hasHeightfield`, …) when it has them. No plugin API change, no module-level shared
  state (Make it code copies the whole module, #199), and the water material elsewhere keeps its static waves.
- **The tap is the node type's own `onTap`**, not a behaviour rule: the push is the tank's internal state (the toy's
  timeline), nothing another node or a variable needs – the simpler of the two the brief offered.
- **Volume conserved, not added**: what the toy's submerged column gains is pushed out of its cells and spread evenly
  over the surface (the level rises a hair), so the sum of the heights stays zero through any loop – the tests check it.
  `splash` (default 4) exaggerates the displaced volume: true to size (1) the rings are invisible at the tank's scale.
- **A quick plunge, a slow rise**: a cosine loop made long, flat swells; a fifth of the period for the plunge gives
  short, visible rings. The fixed light of the relief is in the tank's frame, so the look does not change with the
  camera's or the page's orientation.
- The simulation is reachable as `object.userData.waves` (tests, the console) – the plugin's only export stays
  `register`, which the editor's and the tests' module loaders rely on.
- **Not measured on a phone** (none attached): the S22 frame rate with the reader's post-processing is open; the
  desktop numbers above and the grid row (32 for a weak phone, or simulation off) are the levers.

## 2026-10-30 – staging's versions.json mismatch was the edge cache, not a writer (#175)

- **Cause:** every writer was already right – `osct content sync` (`runSync`), the API's publish (bunny and directory
  store) and the demo workflow (the CLI's sync) write `versions.json` before `latest.json`, after reading it through
  the Storage API (no edge in between). The pull zone has a cache rule for `latest.json` only, so its edges kept
  `versions.json` for 30 days: staging's served the copy cached on 2026-10-28 17:15, 13 minutes before `6448aacb4ab7`
  was retired. The storage's copy (read through an uncached URL form) lists all four builds, `b6b0ebaabcfd` current.
- **Decision: no storage repair, an edge rule plus a purge** – done by a person with the account API key
  (`docs/content-cdn.md` "Repairing a stale versions.json"). The CLI still has no account API key and gets none.
- **The check lives in `osct content status`** (`versionProblems` in `content-sync.ts`): storage disagreement exits 1,
  a disagreeing edge copy only warns. No API change – its publish always rewrites `versions.json`, so it cannot keep
  a stale record, and the editor never reads `versions.json`.
- `osct content sync` of the build `latest.json` already names used to stop with "up to date" whatever `versions.json`
  said; it now rewrites `versions.json` then (the entry dated by `latest.json`'s `activatedAt`).

## 2026-10-30 – Make it code copies a plugin's whole source; a made type switches once it builds (#199)

- **Decision: copy the whole plugin, not the build.** The issue offered two fixes: copy the plugin's whole source, or
  detect the build's free identifiers and refuse. Copying is the one that is always correct – a build may close over
  anything `register` or the module defines (the aquarium's `FISH_COLOURS`, helpers, constants), and finding free
  identifiers needs a real parser and scope analysis, and then still only refuses. The made plugin keeps the original
  module as it is (its `register` export renamed, its `osct-plugin-api` type imports moved to the head) and calls it
  with a copy of the api: `registerNodeType` of the copied type registers the new type (the node's values as the
  parameters' defaults), every other registration is dropped – the textures, materials and other types stay the
  original plugin's, which stays installed. The source copied is the one running on the stage: the source last run in
  the Code tab, else the stored one, else the declared plugin's `index.ts` (copied next to its `plugin.js` by the
  content build). Refused with a message only when no register export is found (`export const|function register`,
  `export default …`) or the source cannot be read.
- Side effect of a whole copy: listeners the original `register` subscribes (`api.events.on`) are subscribed by the
  made plugin too. Accepted – a node type's plugin rarely listens in `register`, and the author edits the copy anyway.
- **A made type switches the node only once it builds.** The engine records why a plugin node type's last build failed
  (`nodeTypeFailure`, cleared by a good build or a new registration). Make it code saves the plugin and leaves the node
  switch pending (`plugins.pending`); the Run applies it on the stage and reverts it when the build failed – the error
  is the Run's (the Code tab's, which opens the plugin through `plugins.focus`), and the next Run of that plugin tries
  again. A Run also reports a node type of the plugin that failed on the stage. "Run doesn't rebuild" in the issue was
  the made code failing again on every Run; the stage's refresh builds every node anew.

## 2026-10-30 – The phone's sheet: the uncovered row continues the stage (#200)

- Dragged down, the sheet uncovers part of its frozen grid row. Of the issue's two fixes, painting was chosen: extending
  the canvas under the sheet would resize it at the drag's start, and with the stage's fixed vertical field of view the
  whole picture would shrink and jump (a second resize, the flicker #155 removed). The row shows a horizontal gradient
  of the stage's bottom edge, sampled once at the drag's start (`ArScene.sampleRow`, one draw and one row read – twelve
  averaged parts), as the workspace's background while dragging; the stage still resizes once, on release.

## 2026-10-30 – Code files in the Library: scripts are plugin sources, shaders are assets (#186)

- **The model**: a **script** (`.ts` / `.js`) uploaded in the Library **is** a plugin source – a row of `plugins`, the
  Code tab's list. The Library shows those rows; there is no second copy and no asset row for a script. A **shader**
  (`.glsl`, `.frag`, `.vert`, `.wgsl`) is an **asset of the kind `shader`** in the asset store (versions, sha256 dedupe,
  `assets.kind` is a VARCHAR – no schema change). Two stores because the two are different things: a script is code the
  content build compiles (it has an id, it registers types), a shader is a file a script loads.
- **A plugin loads a shader by its URL, not its name** (`api.loadText(url)`, plugin API 1.5): the reader has no Library,
  so a name could not be resolved there; the URL is what both fetch. The editor keeps it right: an asset's uses include
  the plugin sources that name its URL (LIKE through `Db::contains`), delete refuses while one does, and a replace
  rewrites the URL in those sources (a recorded change each) – so the URL-in-code stays the one reference.
- **`api.loadText` is a promise, layers stay inline**: `register` is synchronous and a layer's `glsl` is needed then, so
  a file is loaded where a build runs (material, pass, node type) and swapped in (`needsUpdate`). Making `register`
  async (so a layer could load a file) was left out: it touches the engine's install, the editor's Run and the content
  build's recording run. The recording API answers `loadText` with `""`. The API bump to 1.5 is a change in `shared/`,
  so the content schema went to 2.18 (nothing new in the content).
- **A script's uses** are the draft's rows that name a type it registers – `"type":"<t>"` in the JSON of the book, a
  spread, a target, an entity or an entry (a procedural texture also as a value) – with the types read from the source
  text, as the MCP server's `pluginTypes` reads them. A text scan, not the truth: the content build knows for sure. It
  is enough to refuse a delete that would leave nodes without their type, so **`DELETE …/plugins/{pid}` now refuses
  while used** (409 `plugin-in-use`, `?force=1`) – for the Code tab and the MCP too (`delete_plugin` got `force`).
- **Upload checks**: extension (per store – a script sent to `POST …/assets` and a shader sent to `POST …/plugins` get
  a 400 pointing at the other), at most 256 KB (`Plugins::MAX_SOURCE_BYTES`, also `Assets::TEXT_MAX_BYTES`), content type
  `text/*`, JavaScript / TypeScript or one that says nothing (`application/octet-stream`), and `video/mp2t` for `.ts`
  (Windows registers `.ts` as an MPEG transport stream, so browsers send that), and the bytes UTF-8 without NUL. A
  script's id is `?id=` or its file name made an id (`Wobble Effect.ts` → `wobble-effect`); a taken id is 409
  `plugin-exists` – the Library then says to use *Replace…* (no silent overwrite).
- **UI**: the code files are a list of their own under the media (`CodeFiles.svelte`), not cards – a shader has no
  picture, and a script is not an asset. The filter `code` shows it alone; the picker never shows it (nothing picks code).
  The preview is a second, read-only Monaco (`createCodePreview`), loaded with the first preview; GLSL is highlighted as
  `cpp` (Monaco has no GLSL), WGSL as `wgsl`. *Open in Code* goes through `plugins.focus`.

## 2026-10-30 – The environment replaces the HDRI sky box (#185)

- Tilman: "Environment replaces the HDRI sky box." – once the book has an environment, the stage's sky (shading
  *rendered*) is its look-around world, in every tab; while the Environment tab is open, in every shading as before.
- **Lighting: the reader's, not the HDRI's.** Decided by what the reader does: it lights the AR content with the
  engine's fixed ambient (#BBB, 1) and sun (0.6) in `engine/src/scene/view.ts` plus the content's light nodes; there is
  no image-based light anywhere in the reader (`scene.environment` is never set), and the look-around world is a
  full-screen underlay that lights nothing (the world model's bake has its own lights, for the cube only). So with the
  world as the sky the HDRI does not light (it only fills the camera window, below) – the scene's own lights at full strength. Without an environment
  the HDRI lights the stage as before (a studio stand-in for the camera picture's room, the editor's own look). The
  Environment tab's preview follows the same rule (it used to keep the HDRI's light).
- "Has an environment" = the draft's `book.environment` is set, or the author's edits in the Environment tab start one
  (edited away from the default, unsaved) – the stage shows unsaved values as it shows unsaved entity overrides. A book
  without one is *not* shown with the reader's default café outside the tab: the issue keeps the HDRI there.
- **The camera window shows the HDRI as a background** (the orchestrator, before merging: the black window around the
  book would show on every rendered spread of a book with an environment). The world's pass leaves the window – and
  the open roof – transparent (alpha 0) where the reader shows its camera picture; the stage's sky sphere is drawn after
  it with destination-alpha blending (`(1 − dst alpha) · sky + frame`, `behindWorld` in `mock-stage.ts`), so it fills
  only the uncovered part, soft edges included, in both draw paths (onto the screen, into the post chain's buffer). It
  is the camera picture's stand-in, like the desk: no light (`scene.environment` stays null, the scene's lights stay at
  full), only while rendered (other shadings show no HDRI anyway). No engine change; the reader keeps its camera
  picture there. A grey gradient was the fallback, not needed.
- The HDRI picker stays (labelled *HDRI*, dimmed, "without an environment"): it is the device's setting for every book,
  used again for books without an environment – and, with one, the stand-in in the camera window.
- Per-spread environments: not in the content schema (`shared/types/environment.ts`: book-level only), so the stage
  follows the book's. When a spread level comes, `bookEnvironment` in `editor/src/lib/stage/sky.ts` is where the
  spread's wins.

## 2026-10-30 – The vertical axis and snapping (#190)

- **Snapping is off by default** and the toolbar switch turns it on; Shift or Ctrl held turns it around for one drag.
  Off keeps every drag as it was before #190 (the placement handles still round to whole mm, the gizmo moves freely),
  and the old Ctrl-to-snap keeps working – it now snaps to the grid, axes, objects and outlines at the toolbar's
  precision instead of the fixed 0.05 widths / 15° / 0.1. Shift is the issue's key; on the stage Shift-drag also pans,
  but only where no gizmo handle or placement handle took the pointer, so the two never meet.
- **Move snapping works in the stage frame (mm), per axis**: nearest line within 8 screen px (turned into mm by the
  camera's distance, so it feels the same at any zoom) to the pivot or the box's edges / centre; then the grid; then
  the move step. The **move step** (the issue's "precision" for move) is the step a move rounds to while the grid is
  not a snap target – with the grid as a target, the grid's own step is the move's precision, so there is one number
  for it, not two. Grid snapping works whether or not the grid is shown (a 3D tool's increment snap).
- **Only the axes the dragged handle may change snap** – the X arrow snaps x alone; a node turned away from the page's
  axes keeps its turned handle unsnapped rather than being pulled off the handle's line. The centre handle (screen
  plane) snaps the page's x and y, not the height.
- **Rotation snaps the angle turned since the drag began** (TransformControls' own convention, about the drag's axis),
  not the absolute Euler angles – a node at 7° turns to 22°, 37° …; absolute rounding per Euler axis jitters for nodes
  turned about more than one axis. **Scale** rounds the absolute factor and never goes below one step (TransformControls'
  own scale snap could round to 0).
- **The placement handles snap too** (a print dragged on the page): that is where a page edge or another print's edge
  matters most; the corner snaps the right edge (the width). A print's own outline and its own entity are not lines
  for it. Snapping to objects' boxes uses the mesh bounding boxes in the stage frame, the editor's helpers left out.
- **Guides**: the lines a drag snapped to are drawn in magenta through everything while it lasts (the grid is blue /
  red, the vertical axis green – the stage's own colours, not UI chrome, so RULES #32's "no colour" does not reach
  them).
- The grid & snap group is always one button with a panel (role dialog), not a radio menu: it holds switches and
  number fields, which a WAI-ARIA menu cannot. The grid's on / off and step are the same settings as the Stage panel's
  rows (both write `preview.ts`); the panel keeps its rows.

## 2026-10-30 – The import's preview (#182)

- Tilman: "The import from CDN dialog is still confusing, since it doesn't say how many books it imports." – the form
  shows what comes in before anything is imported (content base, build from `latest.json`, the one book with its
  counts) and the button names it; a draft of that id is announced as replaced with its edits lost, then the #183
  comparison and confirmation run as before (no second confirmation).
- One endpoint, the import's own body: `POST /editor/import/preview` (not `GET …?source=`) – the CDN's preview needs
  the server (only it knows `CONTENT_BASE_URL`), and a configuration the browser read is checked exactly as the import
  will check it (parse, entities, plugins), so an invalid configuration fails in the preview, not at the import.
- No server-side fetch of an arbitrary URL (`source=url&base=…` was considered): the browser already reads a content
  base (the CDN allows it), and a server that fetches any address an editor types is a request-forgery path. A URL that
  does not allow the page to read it shows that error with its address; *the CDN* stays the server's.
- The CDN tab's book-id field (#183) is gone, no fallback: the import refuses a configuration without `book.id`
  (`parse`), so there is no id to fall back to. The import is still keyed by the path id the form takes from the preview.
- The import does not check that the build it fetches is the one previewed (an optional `build` in the body would);
  the CDN moving between preview and import is rare, and over an existing book the comparison shows the build that
  really comes in.

## 2026-10-30 – Panels' first divider and defaults; the post-processing level in words (#193, #181)

- **The book's master chain stays in the Stage tab's post-processing** (#181 asked to consider moving it to the book
  page or the Environment tab, shown read-only in a spread; "keep it simple"). Kept where it is: once the head names
  the level ("post-processing · the whole book" / "· only this spread"), the line counts the spreads it changes and
  Save says what it saves, the level is unmistakable without a second place. Moving it would split one list over two
  places – the book page has no stage to preview passes on (they show only under *rendered* on a spread), and the
  override starts as a copy of the book's, which wants both in reach –, and add a read-only view and a link for
  nothing the wording doesn't already do. Revisit only if authors still confuse the two after the new wording.
- The level line replaces the *uses: the book's / own* pill pair: its end is the switch (**own for this spread** /
  **back to the book's**), so the choice is still there in one place, in words.
- N in "changes all N spreads that use the book's" counts the draft's spreads without passes of their own – an empty
  own list is an override too (post-processing off) – and the spread on the stage as the panel holds it, so an
  unsaved *own for this spread* already shows the override line.
- #193 defaults: Stage tab all closed on a first visit (spread, stage, post-processing, vars and events), the stage's
  closed head names desk and grid; Environment: *environment* open, *preview* closed. The **Entity tab** keeps its
  plain section headings (not collapsible): it already shows only the selected level, and components, filters and the
  plugin material appear only when they have entries – the proposal's state without a toggle. Stored open states per
  browser (`osct-editor-sections`) are untouched; only the first-visit default changed.
- The first section's divider goes once in `app.css` (`.section:first-child`), for every panel and the Library's
  picker head (its own rule went). The Entity tab's first section keeps its line: it sits under the breadcrumb, not
  under the tab row.

## 2026-10-30 – Removing a spread or an entry with everything on it (#198)

- Tilman: "AI has the same rights as the user most of the time. So also it needs to get this confirm dialog somehow,
  like the UI." – a spread or an entry goes with everything on it, in **two steps** for people and AI tokens alike:
  the impact and a confirmation id first (nothing written), then the same request with `confirm`. This replaces the
  earlier rule that a spread with entries is refused (`spread-not-empty`, #166 below); the opening spread stays.
- One confirmation helper for the import and the removals: `Confirmation.php` (the stateless HMAC #183 built,
  `<expires>.<hmac>`, 10 minutes, bound to the purpose with its ids, the user, the AI token and a digest of the
  state). A removal's state is every row it takes, the kept entities' users, the files with their uses and the book's
  change log (count, newest) and `updated_at` – any change in the book voids the id, as the issue asked.
- Library files: only the uploaded ones (`assets`) count – the import's files are the content build's, never deleted.
  "Used only here" = `Assets::usagesOf` finds no use beyond the removed rows (the environment counts as a use).
  They go only with `deleteFiles: true` (off by default); a removed file is a change `asset` with its row and versions
  as `before`. The store's files are deleted after the commit (a store cannot roll back).
- The entity count of the impact includes a target's own (inline) entity (`ref: null`) – for a person it is the AR
  content that goes, not only the shared rows.

## 2026-10-30 – Publish to the own environment, import comparison, the content store (#183, #197)

- Tilman: an instance publishes only to its own environment (`ENV`); a connected CDN has priority; `local` only on a
  developer's machine; warn wherever the directory store is the target, in **content** words ("Content is better than
  data"); import from anywhere, but with a version comparison before it overwrites. Implemented as 403
  `other-environment` (an env name that is valid but not the own one; a malformed one stays 400 `invalid-env`).
- The import's confirmation is a **stateless HMAC id** (`<expires>.<hmac>` with `SECRET`, 10 minutes) bound to the
  user, the AI token, the incoming content's digest and the draft's state (`imported_json`, `imported_hash`,
  `updated_at`, the change log's count and newest id) – no table. An import changes `imported_json`, so an id works
  once. #198's delete confirmations may want a shared helper later; this one lives in `Books::confirmImport`.
- The next-to-Publish warning is the short *No CDN connected* (its Info view help and the publish step carry Tilman's
  full sentence) – the whole sentence does not fit the top bar, on a phone neither. The sentence itself comes from the
  API (`ContentStore::SERVER_WARNING`), so the editor and the MCP server say the same.
- Content store and var/ (`Paths.php`): a dev checkout keeps them at the top level; a deployed layout (`<docroot>/api`,
  the FTPS staging) inside the API's folder (`api/content-store`, `api/var` with a deny `.htaccess`) – the parent of the
  docroot is unknown on shared hosting. Settings pointing into `api/db/` are read as the same name at the new place (a
  developer's `config.local.php` keeps working, its files move); a setting pointing elsewhere never receives a move (the
  tests' temp folders, a mounted volume). The FTPS staging moves on its first request after the deploy; if `rename()`
  fails there the old place keeps being used and every request logs it.
- [ ] After the merge, check on the FTPS staging that `api/content-store` and `api/var/log/error.log` exist and
  `api/db/` has only the schema (an FTP listing); else the error log says why the move failed.

## 2026-10-30 – The demo video's tooling (#195)

- Tilman: *"Kein Text."* – the WIP video has no titles and no end card; only the UI's own words. It is recorded from a
  local editor against a **copy** of the SQLite with the demo imported from the CDN, never uploaded by us
  (`editor/tools/demo-video/README.md`). Recording-only CSS hides the account's address, the AI connections and
  Android's blue tap highlight; nothing else in the UI is changed.
- The screencast delivers device pixels only with the browser's own scale (`--force-device-scale-factor`); an emulated
  `deviceScaleFactor` gives CSS-pixel frames. So each format gets its own headless Edge.
- [ ] **Make it code on the aquarium's tank leaves the tank empty on the stage** (found while recording, 1.42.0): the
  plugin's `FISH_COLOURS` lives in `register()` outside the builder (`fixtures/demo/plugins/aquarium/index.ts:146`),
  `make-code.ts` copies only the builder, so the generated `tank-code` throws; *Run* does not bring the tank back, a
  reload does. The generated code also shows TypeScript squiggles. Needs an issue (the worker could not file one); the
  video uses *make it code* on the key's model instead.
- [ ] The phone's sheet dragged **down** shows black under the stage until the canvas resizes on release (headless Edge,
  CDP touch) – worth a look on the S22.
- [ ] Android's default blue tap highlight flashes over tapped links in the editor on a phone (the books page's cover
  link) – `-webkit-tap-highlight-color: transparent` with a visible `:active` state would be calmer.

## 2026-10-30 – A spread card's menu: right click, long press, menu key (#196)

- Tilman (from his phone): *"+ after / remove – should on desktop only appear on right click and on mobile on long
  tap. Icons included."* The cards carry no buttons; one menu for all three ways in (`ContextMenu.svelte`, the logic in
  `context-menu.ts` / `menu-trigger.ts`). The stage's right-click menu moved onto the same component (RULES #32: a
  control is built once), so it gained the keys and stays on the screen.
- Order *Open*, *Add a double page after*, *Remove*: the default action first, the destructive one last.
- Disabled items stay focusable (`aria-disabled`, WAI-ARIA APG) and show their reason under the word – the menu has no
  Info view of its own, and on a phone there is none at all.
- The remove question moved from `window.confirm` into the card (*Remove* / *keep*, as the Library and Code panels ask);
  adding asks nothing, as before.
- The long press opens at 500 ms or at Android's own `contextmenu`, whichever comes first; 8 px of movement cancels it.
  Not yet tried on the real S22 – only CDP touch emulation in headless Edge.

## 2026-10-30 – Schöpfer's desk from the catalogue (#187)

- **Tilman** (issue, with two catalogue photos kept outside the repo): "Das ist kein Plywood … Und Material echt
  heißt"; priority: "Die Fächer sind besonders wichtig, dass die zu erkennen sind. Und die Platte nicht massiv
  erscheint." The model follows the catalogue: aluminium sandwich top with linoleum and an oak edge band, oak drawers,
  black powder-coated steel frame. Size stays 1800 × 800 (#109), the height is now the catalogue's 750 (the Eiermann
  keeps 720).
- **Interpretations** (say so if wrong): the catalogue's "M 200 × 90 × 8" is read as 8 cm from the surface to the
  drawers' bottoms (the panel itself is 24 mm – thin, as Tilman asked). The photo shows one drawer; the model keeps
  three (the earlier three cutouts, "Fächer" plural), **pulled out by 150 / 60 / 110 mm** so the dark insides read from
  above – a desk with its drawers shut would show only their oak fronts under the edge. The drawers hang under the
  frame's flat rim (5 mm) – a 6 mm gap under the top where they stick out. The legs splay 4° front to back (tops
  ±350, feet ±400 – the edge of the top) – read from the photo's perspective, not measured.
- **The default reader view does not show the drawers** (nor does *far*): it is 35 cm from the book and looks down on
  it, the front edge is 40 cm in front of it. They show once the camera is tilted low (*low*, or a drag) and from the
  side. Under Ferndale Studio 04 (the default sky, a yellow light from above) the linoleum reads olive-grey from
  above and grey from the front; in textured shading it is blue-grey (the other skies not checked).
- **The black frame under the studio HDRIs**: unlit by tone mapping, the HDRIs' bright lights made the flat faces of a
  black dielectric (F0 4 %) look tan whatever the roughness; the steel has a low specular level (Blender's Specular
  IOR Level 0.15 → `KHR_materials_specular` 0.3), so it reads dark brown-black in rendered shading and black in
  textured. The oak is drawn a little darker than a sample of light oak for the same reason (it clips to yellow).

## 2026-10-30 – Plugins everywhere: materials, textures, make it code; the aquarium; the zero plane (#188, #189)

- **The variant** (Tilman's request in #188, the table now in docs/plugins.md "Where a plugin can go"): plugin API 1.4
  adds `registerMaterial` (a whole material – the 8th Wall `registerShader` / Unreal custom material place) and
  `registerTexture` (procedural textures) and the parameter kind `texture`; "make it code" is Unreal's *Create Blueprint
  from component* – the Entity panel writes a Code tab plugin from a node (or its look) and switches the node to it.
- **A node's material replaces every mesh's material of its own object**; a node type opts a mesh out with
  `userData.keepMaterial` (the aquarium's water takes the material, its glass and fish keep theirs). Layers patch a plugin
  material in place (marked `userData.osctOwned`), never a clone – a clone would cut its `time` uniform off.
- **Texture values are strings or `{ type, …params }`**: `""` none, a camelCase name a procedural texture, anything with
  a dot or slash a file. No schema field for texture assets: the engine loads a file texture itself (shared per URL,
  counted), the build turns a file next to the node into its content path. A Library file's URL in `data_json` counts as
  a use of the asset already (`Assets::usagesOf` searches the JSON).
- **Schema 2.17 is a MINOR, with one caveat**: a 2.16 guard refuses a recorded spec whose parameter kind is `texture` (it
  knows no such kind) – a book whose plugins take textures needs a 2.17 app. Nothing was released with 2.16.
- **The zero plane check warns, never refuses**: a model may float on purpose. Only models are checked (bounding box from
  the glTF accessors' min/max through the node transforms); upright videos are not – the build does not know a video's
  height. The test fixture (`fixtures/content`) has many pivot-centred models that now warn; they were left as they are
  (tests read their placements) – open: fix them or keep the warnings.
- Make it code copies a plugin node type's `build` by `Function.toString()` (the compiled code): a name the build took
  from its own file (a helper, a constant) must be brought along by hand – the generated comment says so.

## 2026-10-30 – Connect an AI agent: the guide for any MCP client (#194)

- **Tilman** (issue): "Claude is one – OpenCode, Codex etc. Keep it more general." The guide shows the generic four
  (name, `node <file>`, `OSCT_API_URL`, `OSCT_EDITOR_TOKEN`) first, then snippets for Claude Code, Claude Desktop,
  Codex CLI, OpenCode and Cursor – each format checked against the client's docs on 2026-10-30 (URLs in
  `editor/src/lib/mcp-setup.ts`). Codex's docs now redirect from developers.openai.com/codex/mcp to
  learn.chatgpt.com; Cursor's table lists `type: "stdio"` as required although its samples omit it – the snippet sets it.
- **The server's name is `osct-<env>` on every instance, production included (`osct-production`)**: the brief's example
  had `osct` on production, but the repository's `.mcp.json` already uses `osct` for the local dev API, and in Claude
  Code a project's server hides a user server of the same name – inside the checkout the production server would
  silently be the local one. One line (`serverNameFor`) if Tilman wants plain `osct` for production after all.
- **The environment comes from the API**: nothing in the instance knew it (the content store's environments are where
  a publish goes, not what the instance is), so `ENV` was added to `Config` (default `local`), set in the Kamal
  destinations and the FTPS staging deploy, and `GET /health` answers it. An older API without it: the host names the
  server (`osct-osct-porschuetz-de`).
- **The path is the person's**: the editor cannot know the checkout, so a field takes it once (localStorage
  `osct-editor-mcp-file`); without it the snippets say `/path/to/osct/mcp/bin/osct-mcp.mjs` openly.
- Open: a **one-file download of the MCP server** (SCUTOONS §3a) – a bundled `osct-mcp.mjs` built in CI or the image and
  served by the instance, so a person needs Node but no checkout. Not built here: `bin/osct-mcp.mjs` bundles `src/` with
  esbuild at start and needs `mcp/node_modules`; a served bundle needs a build step in the Dockerfile (the mcp
  dependencies in the build stage), a route or static file next to `/editor`, and the version kept with the app. Its
  own issue when wanted.

## 2026-10-30 – AI connections: personal access tokens and the MCP guide on the books page (#142)

- **Tilman's decision** (issue comment): the key for pairing and the MCP guide "like SCUTOONS" but on the dashboard (the
  editor's books page), not only an account page – connecting Claude is a first step of working. Built after
  `scutoons/agents/MCP.md` §3: `api_tokens`, prefix `osct_`, SHA-256 hash, 182 days, renew = the same token moves on.
- **Why now, before SES (#12)**: staging's sign-in mail does not arrive, so the token is made with the browser session
  the editor already has; the MCP server then needs no mail at all.
- **Limits** (`Auth::session()` / `Auth::refuseToken()`, 403 `not-for-ai`): a token cannot make, renew or revoke tokens,
  set the password, delete the account or publish to **any** environment (the MCP's `publish` to local / staging works
  only with a session). Everything else is the person's rights, role checks included; a token of an account without
  editor or admin role is 401.
- Open: the admin API (`/admin/*`) takes a token like a session (an admin's AI could grant roles). SCUTOONS limits admin
  changes to proposals – decide whether OSCT refuses them to a token too.
- Not built: the reminder mail before expiry (SCUTOONS sends one; OSCT shows *expires* in red for the last 14 days), a
  one-file MCP download (SCUTOONS §3a) – the guide's snippet still points at a checkout of the repository.

## 2026-10-30 – The desks on a phone (#184)

- **Reproduced in emulation only**: the S22 was not connected; headless Edge at 360 × 780 @3 and 390 × 844 @2 with
  touch, on D3D11, Vulkan and SwiftShader, rendered all three alike.
- **The frame vanished because the Eiermann steel was a dark mirror** (metallic 0.85, base 0.16): measured on the 360 px
  phone shot, 30 % of the frame's pixels lay within 10 grey levels of the background behind them in rendered shading,
  and in textured shading (no environment, so a metal gets almost no light) the frame's median was 23 on a background
  of 12. The single strut that catches a bright reflection then reads as a stray bar under the top – the most likely
  "extra plane". Now satin graphite powder coat (metallic 0.15, roughness 0.45): textured 0 % within 20 levels,
  rendered frame median 99 on 76.
- **Ruled out with evidence**: the GLBs (normals and winding agree, every face outward, no duplicate or overlapping
  coplanar faces, 236 / 124 triangles – `desk-models.test.ts`), depth precision (24 bits; a 16-bit buffer emulated by a
  256× smaller near plane makes the page's printed layers fight, not the desk), no pixel-ratio or LOD code, no shadow
  catcher (the book's soft shadow is intended).
- **The tubes stay double-sided**: they are open, and single-sided tubes would show holes where an end faces the camera.
- Open: confirm on the S22 itself (a GPU-specific cause cannot be excluded without it).

## 2026-10-30 – The stage toolbar in groups (#180)

- **Groups expand by the toolbar's room, greedy from the first**: all collapsed, then transform, pick, shading expanded
  in turn while the toolbar fits one row (`lib/tool-groups.ts` `expandedGroups`, measures from the toolbar's CSS and
  the `--control-height` token, 4 px slack). On a phone the room always leaves ‹ › their place on the top row, so the
  layout does not change with the sheet's height. 1280 px: all expanded; 768 px tablet: shading collapsed; 360 px
  phone with a finger: all collapsed (156 px).
- **#177's fallback, simplified**: `wrapRows` and the sideways-scrolling toolbar are gone (one row always); ‹ › keep
  their lower corners (#171) and still move to the top right when the stage is too short (`stepsOnTop`, now with the
  toolbar's measured one-row height). The sheet's drag code is untouched.
- **The group menu is fixed to the screen** (a short stage would clip it) with a backdrop that takes the outside tap
  (it picks nothing on the stage), like the stage's right-click menu; `.tools` is z-index 2 so the menu covers ‹ ›.

## 2026-10-30 – Plywood on the desks' cut edges (#107)

- **The plies are drawn in code, not downloaded**: the issue proposed a CC0 plywood texture with a visible edge (Poly
  Haven, ambientCG), but downloads need Tilman's OK (workspace `ORCHESTRATION.md` §7). `editor/src/lib/stage/plywood.ts`
  draws one stack of 13 plies (since 1.37.1; 1.37.0 had 7 – Tilman: "more layers, we are 18 mm"; 18 mm birch plywood is 13-ply) (birch long grain / darker cross grain, glue lines) into a 512 × 128 `DataTexture`
  once (≈ 5 ms warm, no per-frame cost); a CC0 photo can still replace it later if wanted.
- **Edge UVs**: u along the edge (250 mm a repeat), v one stack through the thickness – the Eiermann board one stack,
  Schöpfer's 60 mm top three (a 60 mm board with seven plies would read as stripes). Schöpfer's model now has an `edge`
  material too (`editor/tools/desk-eiermann.py`).
- Found while there: the default desk (Eiermann) never got its plywood look until the desk was switched – `setDesk`
  returned early for the desk the stage started with. Fixed with the same change.

## 2026-10-30 – Tutorial re-shoot and a look at the Stage panel (#148)

- **The key shots are re-shot** (demo 03, 05, 10; tools 07, 08, 12; new tools 13): the local demo draft was imported
  again from the demo's content base on the CDN (`https://buildingfictions.b-cdn.net/demo`, 1.36.1), whose key is the
  brass key – the reader dev server's bundled content was still an old build with the dragon. The stage frames the key
  from low over the left page, so the printed sheet's outdated text ("a dragon") stays out of the picture until the
  sheets are rendered again (#179).
- **A `$state` that an effect both reads and writes on its first run loops**: the Entity panel's timeline effect called
  its frame tick synchronously, read `timeline` and wrote it – with a model that has clips (the key) selecting it ended
  in `effect_update_depth_exceeded`. The timeline is `$state.raw` (a proxied object never equals the raw one) and the
  first tick runs `untrack`ed.
- **A scrolling element in a panel's flex column needs `flex-shrink: 0`**: `overflow: auto` drops its automatic minimum
  height, so the timeline collapsed to nothing in the phone's sheet (the rows and sections already had it, #170).
- Found and left for later: ‹ › over the stage toolbar at the sheet's almost-full height (#177), sticky hover on touch
  (#178), the demo's sheet text (#179) – all in Backlog.

## 2026-10-30 – Type-only imports, `verbatimModuleSyntax` on (#176)

- **The flag is on in every TypeScript config** (client + service worker, engine, editor + its plugin API, scripts,
  mcp – all ESM, none emits CommonJS); the editor's `false` override is gone, and Kit 3's `tsconfig_invalid` warning
  with it. Found with the compiler and fixed by TypeScript's own quick fix (whole declaration → `import type` where
  every name is a type, else `type` on the name), no reformatting.
- **No runtime change, checked by emitting**: with the flag on, the bundlers (oxc, esbuild) keep every import not
  marked `type`. So a value a file used only as a type (three.js classes in signatures, enums like `EntryCategory`
  or `GameMode` in type positions, element classes like `EntryDetail`, a test's `BaseStore`) got `type` too –
  otherwise `entry-page.ts` would newly import `@/components/consultation`, `types/game.ts` `./common`, … Every
  program was emitted with the flag off and on and the import lists compared: identical (one cosmetic
  `import i18next, {} from "i18next"`). An existing `import { type A, type B }` (scripts' `build/entities.ts`) would
  have become a side-effect import `import {} from …`; it is `import type` now.
- **Content schema 2.16** only because `shared/` changed (RULES #10: every change there needs a bump) – nothing new in
  the content; the row's app version in docs/content.md is filled in at the merge.
- Open: `tsc -p engine` on its own fails before and after (`vite/client` and three's types are not found through
  `../client/node_modules`) – the engine is checked through the reader's and the editor's configs.

## 2026-10-30 – The Stage panel taps, sets variables, keeps a timeline; the demo's key (#88)

- **The tap button goes through the engine's own tap**: `ArScene.tapTarget` is the one path (the entity's `onTap`, the
  app's `targetTapped`, the core event); the reader's document click reaches it after the hit test, the editor through
  `SceneInspection.tap(targetId)` – on the inspection, not `IArScene`, because only editor tools use it (RULES #32: the
  reader never calls `inspect()`). It taps nothing unless the scene runs and the target is found with an entity, as a
  reader's tap could not either; the panel disables those buttons.
- **A manual `set` is a plugin's `set`**: the Stage writes through `runtimeApi("stage").vars` – the same name, scope and
  value checks and the same `varChanged` – so a branch tested by hand behaves as if a plugin had set it. The scopes are
  the API's four (spread, stage, session, book); the brief's "entry" scope does not exist in API 1.1. Numbers are
  committed on change, not on every scrub step, so the timeline does not fill with `varChanged`.
- **The timeline counts from the spread's opening** (the core `spreadChanged`, or a reset); 100 events kept (was 12).
- **The key's model is written by a Node script, not Blender** (`editor/tools/key-model.mjs`, glTF binary by hand, 7 KB,
  one clip `rattle`): reproducible on any machine, so a test rebuilds it and compares it with the committed file. The
  desks stay Blender models. The tutorial's demo screenshots still show the old stand-in (a dragon) – re-shoot with the
  next tutorial pass.
- Still open in #88: the `behaviour` component and declared `variables:`, bubbling scopes, two spreads on one stage.

## 2026-10-30 – The editor on SvelteKit 3 (#157)

- **`@engine/…` and `@shared/…` stay aliases** (Vite `resolve.alias` + `paths` in `editor/tsconfig.json`), not
  package.json subpath imports: the engine's own files import `@shared/…`, and an editor `#…` import reaches only files
  of the editor package; Node and TypeScript also refuse `imports` targets outside the package (`./../engine`). Only
  SvelteKit's deprecated `alias` option is gone. `$lib` (removed in Kit 3) became `#lib/…` with the file's extension.
- **`verbatimModuleSyntax` stays `false`** in `editor/tsconfig.json` (as under Kit 2): turning it on gives 108
  "must be a type-only import" errors, most in `engine/` (shared with the reader). Kit 3 prints a `tsconfig_invalid`
  warning for it; build, check and tests pass. Open: `import type` across engine and editor, then drop the override.
  → done (#176): the flag is on everywhere, the override and the warning are gone.
- **No version polling**: Kit 3 polls `version.json` hourly by default; `version.pollInterval: 0` keeps Kit 2's
  behaviour (the editor reloads on a stale chunk instead – #160).

## 2026-10-30 – Touch height, tablet portrait, words as labels (#171, #172, #173)

- **Touch control height = the dogma's 44 px** (2.75rem), not the review's 2.5rem: one token raised under
  `@media (pointer: coarse)` in `app.css` (Scutoons does the same in tokens.css); `--top-height` 3rem with it. The
  dogma CSS test checks the token and that the primitives, ScrubNumber and the tree's rows take it.
- **The phone's sheet head is the six tab icons alone** (they share the row, each ≥ the control height): six at 44 px
  fit 360 px, nine did not. ‹ › went to the stage's lower corners (framed icon buttons, phone only); × went to the
  top bar, whose book crumb already leads to the spreads – no second way back was added. The double tap on the grip
  still restores the default height; the drag (pointer capture, the `lostpointercapture` guard of 1.26.5) is unchanged
  and was checked with emulated touch (grip up → half, a tab dragged down → closed, a tap opens).
- **Tablet portrait**: the tree starts collapsed below 64rem until toggled on the device (`treeStartsOpen`), the tabs
  turn to icons in a panel narrower than their words (`wordTabs`: 24rem, 28rem with a finger – measured), and the
  placement rows stack their label above X / Y / Z under `@container panel (max-width: 23rem)`. The column clamping
  order (panel against the tree's width) was left as it was.
- **Labels are part of the contract** (`ParamText.label` in `shared/types/components.ts`, `FilterParamSpec.label`):
  content schema 2.15 (shared/ changed – RULES #10; develop's #90 took 2.14 meanwhile) and plugin API 1.3 (MINOR
  adds). Since #90 the content build records a plugin's specs in `registered`, so a label reaches the content there; a
  2.14 guard ignores the unknown key, a 1.x engine the label. `paramSpecProblems` refuses a label that is not 1–24
  characters (the recording build and the guard both check it). The fallback is
  `paramWords` (camelCase → words), shared so any UI can use it.
- [ ] The default stage view has a fixed vertical field of view (as the reader's camera intrinsics): on a tall, narrow
  stage (a tablet in portrait, 327 × 984 px) the book fills the height and is cut at the sides until the author zooms
  out. Fitting the view to the stage's width would change what the "reader's view" simulates – a decision for Tilman.
- [ ] A touch tablet in portrait with the tree opened leaves the panel 272 px: its head (× ‹ › and five icons at 44 px)
  scrolls sideways there – the documented fallback.

## 2026-10-30 – The plugins' recorded specs (#90) and the MCP tools for the new endpoints (#174)

- One optional field per declared plugin, `registered: { components?, nodeTypes?, passes? }` (type → spec; layers are
  components – the content does not tell them apart), schema 2.14. Present = what the plugin registers is known;
  absent = an older build, unknown until it runs. `recordedRegistrations` merges the declared plugins' specs and says
  `complete` (every one recorded).
- The guard: recorded specs are looked up after the registry (`componentProblems`' new `specs` option, the node type
  spec), so a plugin's parameters are checked before the plugin loads. With every declared plugin recorded, a type none
  registers is refused – a node type only when the content's schema is not newer than the app's (a later MINOR may add
  a built-in node type, which must keep loading in an older app). A plugin without `registered` keeps the old leniency.
- The server reads only the type names (`Editor::recorded`), never the parameters (the guard's job, as before). Code tab
  sources have no recorded specs (nothing is built on the server until #78), so a book with sources keeps today's
  behaviour: any camelCase node type passes a save. The publish now also refuses a component / node type the recorded
  plugins do not register (before: only without any plugins).
- The editor adopts the recorded specs into the shared registry when a draft loads (`plugins/recorded.ts`); a loaded or
  run plugin registers over them, and the next load takes back only the specs it added (same object).
- The MCP server reads the book's plugins only when an entity names a type that is not built in (saves the requests
  otherwise). Its source scan (`pluginTypes`) now finds `registerNodeType` and `registerPass` too; with any Code tab
  source a node type no known plugin registers is a warning, not a refusal (the scan reads text and may miss one).
- [x] The MCP server has tools for the book's passes and the environment (#174: `put_book_passes`, `put_environment`,
  plus `add_spread`, `put_spread`, `delete_spread`).
- [ ] Plugin passes: recorded, listed by `describe_content_model`, but the guard, the build and the API still take
  built-in pass types only (#97).

## 2026-10-30 – The book's passes as the master; the environment through the chain (#149)

- No content schema change: `book.passes` and the spread override (`getPasses`: spread's own, else the book's) exist
  since 2.5. Only the editor (Stage panel, `passes-edit.ts`) and the API (`PUT /editor/books/{id}/passes`, modelled on
  `PUT …/environment`, change kind `passes`) were missing. The editor sends `null` for an empty book list (removes the
  field); a spread's empty own list stays `[]` (off there).
- The look-around underlay is drawn into the chain's buffer (an `UnderlayPass` before the `RenderPass`, which then does
  not clear) only while passes run; without passes the old screen path is unchanged, so a phone without passes pays
  nothing. The look-around shader outputs linear into a render target (three picks the output colour space by target),
  matching the buffer.
- With the world in the buffer the reader needs the AR layer's mask for a `reach: ar` grade. To keep that extra scene
  render off when nothing uses it, passes say `usesMask` (the grade: false for `reach: all`). Kept engine-internal
  (`MaskUsage` in `post/registry.ts`, not on `PostPass`), so the plugin API (1.2) does not change; a plugin's pass with
  `setMask` always gets the mask. A plugin's pass now also sees the world in its buffer (documented in the d.ts).
- [x] The MCP server has no tool for the book's passes (nor for the environment) – RULES #32 says a new endpoint is a
  new tool there; left out of #149's scope. Done in #174 (`put_book_passes`, `put_environment`).

## 2026-10-30 – A plugin's own node type (#77)

- `api.registerNodeType(type, spec, build)` is the engine's builder contract for a book's code: `build` returns `{ object,
  …hooks }`, `buildNode` places it like a built-in node (placement, children, components, layers). Plugin API **1.2**,
  content schema **2.13** (the contract in `shared/types/node-types.ts`; `EntityData.type` widened to `NodeType`).
- **The parameters live in the node's `params`**, next to the placement – no new field: `params` already passed other
  keys through, and an older app ignores them. A spec may not name a parameter `position`, `rotation` or `scale`.
- `src` is one kind (`glb` / `video` / `image` / `none`), not a list: what the issue asked, and enough for the Library
  picker's filter. A model's loaded asset is handed over shared – the plugin clones what it changes.
- The server cannot tell which types a plugin registers (only the stage and the content build run the code), so it
  follows #66's pattern for components: an entity body may name a camelCase type outside `ENTITY_TYPES` when the book has
  plugins (declared, or Code tab sources – `Editor::hasPlugins`), and a publish without declared plugins refuses such
  nodes (409 `unknown-node-types`). In a book with plugins a lower-case typo like `hologram` now passes the API; the
  content build still refuses it. A type is at most 32 characters (`entities.type` is `VARCHAR(32)`; no ALTER needed).
- [x] *(done – `pluginTypes` reads `registerNodeType`, #19 review)* The MCP server still refuses a plugin's node type (`mcp/src/model.ts` `unknownNodeTypes`, `pluginTypes` does not
  read `registerNodeType`) – it follows when an agent needs one.

## 2026-10-30 – A video's size and duration on upload (#91)

- Read in plain PHP (`server/api/src/VideoInfo.php`): mp4 / mov boxes (`mvhd`, the `vide` track's `tkhd`, a quarter-turn
  matrix swaps width and height like a browser's `videoWidth`), webm / mkv EBML (`Info`, the video `TrackEntry`). One new
  column `assets.duration_ms` (ms, like the content's other durations); width / height reuse the image columns.
- No backfill: older rows would need their whole file fetched from the store (the CDN) – they stay null until replaced.
- `+ node` does **not** write `scale: [1, h/w, 1]` for a video: the engine's video plane already takes the file's
  proportions at load (`entities.ts` `fit`), so that would square the aspect. The known size only starts a portrait
  video at a uniform scale of w/h, so it stays within one target width (`videoNodeScale`, `editor/src/lib/values.ts`).
- [ ] Image nodes are 1 × 1 planes and the library knows an image's size too – `+ node` could start them at
  `[1, h/w, 1]` the same way; not done here (not asked in #91).

## 2026-10-30 – Typed boundaries and test gaps (#28, #29)

- Option C, then A (hand-written checks, no schema library): `ApiService.requestAs(isResponse, …)` checks an answer's
  shape (a wrong one is `ApiError` `server-error`, status 502); `UserService` reads localStorage through readers that
  keep a session with fewer fields signed in. The content build's types come from `lib/schema.ts` (`Authored<T>`);
  nested parts get their contract type through `contractPart` after the shared `*Problems` check.
- `shared/` was left alone on purpose: every change there needs a content schema bump (RULES #10), and none of this is
  a content change. So `TriggerInfo` lives in the engine (it reads the file) and `scripts/src/protocol.ts` imports the
  type from there.
- The osct CLI accepts only its known options (`lib/cli-args.ts`): a misspelt safety flag must never run for real.
- [ ] Still open from #28: `PlacementData` unused (needs a schema bump, see the #19 block); `BaseStore`'s
  `propertyListeners` cast. From #29: `loadBuild` still re-implements the pipeline, the server matrix (PHP 8.1, MySQL),
  `service-worker.ts` and the AR scene lifecycle.
## 2026-10-30 – Spreads added and removed on the book page (#166)

- Tilman on the disabled format select: "no hint next to it, the disabled state just has to be clearer" – disabled
  controls are dimmed, get a not-allowed cursor and a select loses its arrow, editor-wide (`app.css`); the reason stays
  in the Info view (RULES #32).
- A new double page **renumbers the pages after it** (Tilman: "the pages are numbered on") – later spreads, entries and
  `print.page` move by two, and removing a double page reverses it. The layout's sheets are matched by page and do
  not move, so later cards show the sheets of their new numbers until a layout with the new pages is imported.
- *(Replaced by #198: removed with everything on it, after a confirmation.)* **Removing a spread with entries is refused** (409 `spread-not-empty`), not "ask and remove them too": the entries
  carry targets and AR (work), a bulk delete is not undone by anything but the change log, and deleting entries one by
  one already exists in the tree. The spread the book opens on cannot be removed either (`initial-spread`).
- The hint "New spreads come in with an import for now" shows only where adding is impossible: the API refuses a
  double page (an older server) – then the book page offers no double pages.
- [x] *(done – `add_spread`, `put_spread`, `delete_spread`)* The MCP server has no tool for adding or removing spreads yet (RULES #32: a new endpoint is a new tool there).

## 2026-10-30 – The Library as the picker; entry category vs what appears (#164, #165)

- Tilman on staging: file dropdowns of identical names ("Target Image, …"), and the Library opened from a video node
  changed the **target's image** (its *Target image* button sat next to *Use* on every image card). Built: every file
  field (`components/FileField.svelte`) opens the **Library in place as a picker** (`LibraryPanel` with `pick`,
  `library-pick.ts`) – the filter preselected, only fitting files pickable, the pick fills the one field it was opened
  for. In place (not the Library tab) because the tab replaces the panel that asked: the new-target form lost its
  values and the Entity panel was unmounted (the tab's *Use* reached no node – fixed too, the Entity tab opens first).
  The Environment tab's pick moved in place as well, so there is one picker; the tab stays the browser of the files.
- **Target images** = images a target of the draft uses, or the import's `target.*`. There is no "marked as a target"
  flag in the API; [ ] add one if uploads meant as targets should show there before a target uses them.
- **#165**: develop, which staging deploys, has offered `model` in the new-target form since 1.10.0. The likely cause
  was the form: an unlabelled category select (glossary, video, text, link) on the *page* row read as "the type", and
  the AR content select sat below the placement under "AR content (optional)". The category and the content stay
  **two choices** – the category is where the reader's consultation menu lists the entry (a glossary term may show a
  model), not what appears – but the category **follows** what appears (video → Videos, else Glossary) until set by
  hand, and both are labelled ("What appears on the page" as pills, then "Entry category"). [ ] Staging itself could
  not be opened from the agent's container – check the form there by hand.
- [ ] iOS Safari may grey out `.glb` files in a file picker (no system type for glTF); the model upload names the
  media types next to the extensions. Check on an iPhone / iPad.
## 2026-10-30 – Local MariaDB in Docker, staging's data, the API test on MariaDB (#168)

- Tilman after #161: *"in future, for testing locally, start a MariaDB in a Docker container, as in SCUTOONS"*, plus a
  dump of staging. Built in 1.26.8: `docker-compose.yml` in the repository root (service `db`, MariaDB **10.11** – the
  version of the all-inkl host could not be read from here, so the LTS the task named; `OSCT_MARIADB_VERSION=11.4`
  matches the Kamal accessory), `scripts/db/pull-staging.sh`, `OSCT_TEST_DB=mysql` for the API test, the CI job
  "Accounts API (MariaDB)". Local development against MariaDB is the recommended setup now; SQLite stays for quick
  tests (docs/server.md).
- **Personal data in a staging dump**: pseudonymised on load by default (addresses → `user-<id>@example.invalid`,
  passwords, sessions, sign-in requests and failed sign-ins gone; `KEEP_EMAILS` exempts your own), the dump deleted
  after loading unless `--keep`. Credentials in `server/.env`, dumps in `server/db-dumps/` – both outside the Docker
  build context and git. One bash script (Git Bash on Windows) rather than a PowerShell twin: the repo's tooling
  scripts are bash, and the dump runs inside the container (no MySQL client needed).
- The first MariaDB run found a second MySQL-only bug: `LIKE … ESCAPE '\'` (admin user search, asset usages) is an
  unterminated string literal on MySQL. `Db::contains` escapes with `!`; the API test scans for the backslash form.
- [ ] Open: once staging is on the Kamal VM, check the SSH route of `pull-staging.sh` against the accessory
  (`STAGING_DUMP_COMMAND="docker exec -i -e MYSQL_PWD osct-staging-db mariadb-dump"`, docs/server.md "Staging's data").
- [ ] Open: the real staging pull is untested here (no credentials in this session) – the script was checked against
  a second database in the local container, directly and over a stand-in for ssh.
## 2026-10-30 – The editor's selection levels and the tree's hierarchy (#162, #163)

- From Tilman's walkthrough on staging: no feedback on a click in the tree, target and entity always shown together,
  a second video added with the first selected became its child, nothing could be moved or named afterwards.
- **One selection** (`editor/src/lib/selection.svelte.ts`): target, entity (the root) or node – the tree, the stage
  and the Entity panel read and write it. A target without AR content is always selected as the target. The Entity
  panel shows the target fields only at the target level and the node rows only at the entity / node level; its head
  is a breadcrumb. The target picker of the panel's head is kept, shrunk to a ▾ after the breadcrumb's target crumb
  (RULES #1: restructured, not removed).
- **Next to the root wraps the root in a group** (adding, dropping before / after the root, outdenting a child of
  the root): the only way to get two siblings under one target, which is what Tilman expected. A group's placement
  defaults to none, so nothing moves on the stage.
- **A moved node keeps its placement values** (relative to its new parent, so it may move on the stage) – no "keep
  transform"; the issue asks for parent and order only.
- **Keys**: Alt + ↑ ↓ to move, Tab / Shift + Tab to indent / outdent (Tab falls through when nothing moves, so the
  focus can leave the tree). Not Alt + ← →: that is the browser's Back on Windows. A finger drags a row by its type
  icon (`touch-action: none` there only), so the tree still scrolls on a phone.
- Content schema **2.12**: a node's optional `name`; its row in docs/content.md says *next* for the app version – the
  version is set at the merge.
- [ ] Not checked in a browser or on the S22 (this session ran no dev server): the drag with a mouse and a finger,
  the selected row's contrast in day and night, the target outline on the stage.
- [ ] Open: renaming in the tree itself (double click / F2), moving a node to another target's entity.

## 2026-10-30 – The phone sheet: icon tabs, a frozen stage while dragging, the camera on the spread's root (#155, #105)

- Tilman on the S22 after 1.26.0: the sheet drag "glitches and competes with the scene drag", the stage still jumps on
  a spread change ("first it jumps, then it is fixed") and flickers on resize. Causes: a 14 px grip (a drag just above
  it landed on the stage), the WebGL canvas resized on every pointer move, the engine waited for its loop's next frame
  after a resize (a blank frame), and the mock camera looked at the first target (different per spread, missing until
  the targets arrived). Fixed in 1.26.4.
- **Tabs as icons on a phone** – Tilman: "Mobile bitte die tabs auch mit icons statt text. Dann ist es auch einfacher
  und auf einer zeile." An exception to the editor's words-over-icons rule, added to RULES #32's UI part.
- **1.26.5**: the touch drag still did nothing on the S22 (Tilman's screen recording). Cause: a touch is implicitly
  captured by the element it starts on; taking the capture for the head fired `lostpointercapture` on that child, which
  bubbled up and ended the drag. A mouse has no implicit capture, so desktop and tests never showed it. **Test touch
  gestures on the phone** (CDP `Input.dispatchTouchEvent` over `adb forward … chrome_devtools_remote`, Brave too).
- [x] The sheet drag on the S22 (1.26.5, over CDP). [ ] Still to check by hand: the icon tabs, a spread change, the
  Code tab with the soft keyboard.

## 2026-10-30 – The books page as covers, the demo's pages rendered (#153)

- Tilman: "a clean dashboard with the books cover as image … bigger preview pictures, less useless info … left the
  books, right half import". Built (1.25.0). The demo has no designed PDFs, so its sheets are **rendered from the
  content** (`render-layout.py`, Pillow) and committed in `fixtures/demo/layout/` (~1.2 MB, small JPEGs) – unlike the
  real book's `layout/`, which stays out of git. The rendered sheets leave the **targets out**: cards and the stage lay
  each `print` over the sheet, so nothing goes stale when a print moves. Run the script again when the demo's spreads
  or texts change.
- Open: the books page fetches every book's tree for its cover's prints – fine for a few books; a cover field in
  `GET /editor/books` when there are many.

## 2026-10-30 – Monaco in the Code tab (#76)

- Tilman (#76, after the textarea on staging: "I thought we use the code completion editor?"): **Monaco**, not
  CodeMirror – its TypeScript worker gives completion and type errors without a worker of our own. Built (1.24.0):
  `editor/src/lib/plugins/monaco.ts`, a lazy chunk of the Code tab; the compiler options are the content build's, the
  declarations `plugin-api.d.ts` (generated from the engine by `dts-bundle-generator`, checked in, drift checked in CI)
  and three's own `@types/three` (the core, ~250 files; WebGPU / node material parts left out – a plugin never sees
  them). Syntax colours are Monaco's own `vs` / `vs-dark` token colours on the editor's grey surface – the one place
  with colour in the editor; say so if they should be greys.
- Open: the Monaco package also builds its CSS / HTML / JSON workers (~2 MB in the image, never fetched – only
  TypeScript is used); trimming means importing Monaco's editor core piece by piece instead of `monaco-editor`.
- Open: a Run's error line comes from sucrase's position and can point at the enclosing statement rather than the
  token; the TypeScript marker underneath is exact.

## 2026-10-30 – One book per environment, made visible and guarded (#143, refs #87)

- Tilman (#143): run the demo on staging once, deliberately – nothing may silently replace the real book. Built
  (1.22.0, content schema **2.11**, MINOR): `latest.json` and each `versions.json` entry carry `book` (the editor
  writes the book row's id, `osct content sync` the configuration's `book.id` – the same by convention). An older
  manifest without it is resolved through its version's `game.config.json` (`book.id`) rather than assumed to be "the
  instance's book" – exact, and only until the next publish. The API refuses a publish over another book (or one it
  cannot tell) without `replace: true` (409 `other-book`); the editor asks naming both, production more strictly.
  The guard applies to `local` too (same rule everywhere). The MCP server never sends `replace`. `osct content sync`
  does not ask – it syncs whatever content source it is given; a store per book stays #87.

## 2026-10-30 – The environment on the stage, world and sky as assets, schema 2.10 (#79)

- Tilman (#79 comment): the Environment block on the book page was too limited – edit it in the editor's stage with a
  preview, the world and the sky as assets from the Library or uploaded, the café one choice. Built (1.21.0): an
  **Environment** tab in the workspace; `worldSrc` (glTF) and `skySrc` (equirectangular jpg / png / webp) in
  `environment` (schema **2.10**, MINOR); the engine draws them in the same single pass – the model is **baked once into a
  cube** from the reader's eye (3DoF makes the cube exact; RULES #4 amended), so the phone pays one texture lookup, not a
  scene per frame. The stage previews the **reader's own pass** (`ArScene.previewEnvironment`, orientation from the view)
  instead of a stand-in world (RULES #32: the author sees the engine the reader runs).
- **Compatibility caveat:** the 2.8 and 2.9 guards (apps 1.17.0–1.20.x) refuse unknown environment fields, so such an app refuses
  a book whose environment names `worldSrc` / `skySrc` (books without them load). From 2.10 on the reader's guard lets
  unknown environment fields pass (the build and the API stay strict), so the next additions are real MINOR steps. Kept
  MINOR instead of a MAJOR: nothing deployed to readers uses an environment yet.
- Open (#79): per-spread overrides; tuning values (window, floor, fade) as content; `.hdr` skies (the Library has no HDR
  kind – a new upload kind and the RGBE loader); the onion sky's preview on the stage (needs a synthetic camera picture);
  animated world models (the cube is static); lighting the AR scene from the sky (#71).

## 2026-10-30 – Editor help in an Info view, Stage panel in sections (#102, #133)

- Tilman, on the Stage panel: explanations "could be in the left side bar, a collapsible info like in Ableton – not
  really needed for using things". The Info view sits at the bottom of the tree column (the book page: bottom left);
  controls carry their help as `data-help` or `title` (RULES #32). The spread's format moved from the top bar into
  the Stage panel's *spread* section, where the world of #79 is meant to join it.
- Open: the books page's import form (`ImportForm.svelte`) still has its hint lines – the books page has no Info view
  yet.

## 2026-10-30 – The grade's reach, content schema 2.9 (#136)

- `grade` has `reach: ar | all`. The phone's camera picture is drawn by the 8th Wall engine into its own canvas (a
  second WebGL context) and never reaches the post chain; `all` grades it through the engine's camera renderer
  instead (`XR8.GlTextureRenderer.configure({ fragmentSource })`, `cameraGradeShader` in `post/grade.ts`) – check that
  this API is still there on an engine upgrade. It is graded before the AR layer lies over it, so passes before the
  grade are not graded on it, and the look-around world is not graded at all.
- A new pass parameter is now MINOR in earnest: the app's guard ignores a pass parameter it does not know
  (`unknownParams: "ignore"`); the build and the API still refuse it. A 2.8 app still refuses `reach`.

## 2026-10-30 – content out of git, one rewrite with the Claude cleanup (#5, #30)

- Tilman: the old Claude attribution leaves the history in the **same** filter-repo run as the content (one force push,
  issue #30 option A). The content source is **kept locally** (`osct-content/content`) – with the mirror backup the only
  copies. `content/` left the tree in 1.19.2; next: develop → main release (production with asgerb), freeze, rewrite, push.

## 2026-10-30 – The editor is not part of the PWA (#122)

- Tilman: "the editor shouldn't be part of the PWA". The reader's service worker (scope `/`) leaves the editor's pages
  (`/editor`) and all their requests to the browser (`client/sw/editor-clients.ts`): no precache, no content cache, no
  offline fallback for them. The editor has no worker of its own (`serviceWorker.register: false`).

## 2026-10-30 – The book's environment, content schema 2.8 (#79)

- Tilman confirmed the draft's two open decisions: the environment is a MINOR step after the light nodes' 2.6. It was
  first numbered 2.7, but #80 (demo book) took 2.7 on develop, so it is **2.8** (the rebase takes the next free number; the reader's Graphics switches **apply on top**
  of the content (the content cannot turn on what the reader has off). Built: `environment: { world, onionSky }` in
  `book.yaml` (`shared/types/environment.ts`, one world `cafe`), `effectiveGraphics` in the engine's `LookAround`, the
  guard and the build check it, `PUT /editor/books/{id}/environment` (draft path), an Environment block on the book page.
  A book without it keeps today's look (`DEFAULT_ENVIRONMENT`).
- Open (#79 "not in this step"): world assets (an equirectangular dome), per-spread overrides, tuning values in the
  editor, the stage preview of the look-around pass. The café is the only world, so `surroundings` follows `world`
  through a single check in `effectiveGraphics`; a second world needs its own branch there.
- The editor's package check (`svelte-check`) could not run here: the editor's `node_modules` is not installed.
## 2026-10-30 – `api.registerPass` wired (#97, 1.16.1) – the pass names are open

- The plugin API's `registerPass(type, spec, factory)` now reaches the engine's pass registry with the plugin as owner;
  uninstalling the plugin unregisters its passes (`removeRegistrations` → `unregisterPassesOf`). Patch: no schema change.
- **Open (Tilman decides, #97):** a spread or book cannot name a plugin's pass yet. The reader's guard
  (`shared/guards/game-config.ts`, `passProblems` without `unknownTypes: "allow"`) and the build's final
  `assertGameConfiguration` refuse it; the editor's API (`server/api/src/Books.php` `PASS_TYPES`) refuses it too.
  The fix in `shared/` is one option each – every `shared/` change needs a schema bump and a re-lock (RULES #10).
- Also open: `PLUGIN_API_VERSION` stays `1.1` (in `shared/types/plugins.ts`); `registerPass` is additive, so a bump
  would be a choice, not a need.

## 2026-10-30 – An MCP server over the editor's API, after SCUTOONS' model (#75)

- Tilman (2026-10-29, #66): "wir brauchen eine MCP-Schnittstelle, dass wir dann beim Bauen in Amsterdam genügend schnell
  auch mit Claude Sachen bauen können"; at this session's start: **"how it is done, do it like in scutoons. important this
  will one day merge."** Decided (`agents/research/2026-10-30-mcp-server.md`): a package **`mcp/`** at the root (Node 22,
  the v2 SDK `@modelcontextprotocol/server` + zod 4 like SCUTOONS' `tools/mcp`, the same file shapes: `main` / `config` /
  `services` / `user` (their `member`) / `prompts` / `resources`), **a client of the API over HTTP with the editor's session
  token – never a second path into the database**; `OSCT_EDITOR_TOKEN` or the pair `sign_in_request` / `sign_in_verify`
  (the code by mail, the token kept in the process, never shown); the tools listed per role (`editor`); every entity through
  the shared guard before it is sent; every write answers with the editor's link – **the person checks the draft on the
  stage; `publish` refuses `production`** (SCUTOONS' MCP has no publish tool at all – whether `staging` should go too is
  Tilman's call). The start bundles `src/` + `shared/` with esbuild (`shared/` imports without extensions and OSCT has no
  root `package.json`, so Node's own type stripping – SCUTOONS' way – cannot run it). `.mcp.json` at the root gives every
  Claude Code session here the server. RULES #10 / #23: `mcp/package.json` carries the one version too.
- [ ] Open: ~~personal access tokens (SCUTOONS' `sct_` tokens, "AI connections" on the account page) when a non-developer
  connects~~ (done: `ApiTokens.php`, #142); a one-file build + Claude Desktop extension; a headless render of the stage for the agent (follow-up issue).
- [x] Tilman, 2026-10-30: **"publish soll beim Menschen bleiben … so lassen wie in PR #92"** – the MCP may publish to
  `local` and `staging` (a check), production is the editor's Publish button; the one step more than SCUTOONS is the
  content build behind that button, on the server (#78) – "letztlich ist das ähnlich". His flow: Claude builds the draft
  over the MCP, he checks on the stage and clicks Publish – nothing by hand, nothing on GitHub.
## 2026-10-30 – The demo book and the plugin API 1.1 (#80, decided alone – to review)

- Tilman (2026-10-29): a sandbox book that uses everything the editor can do, with game narratives, the book API
  (progress) and inter-spread interactions – "call it demo", on staging when done. Decided
  (`agents/research/2026-10-30-demo-book.md`): **`fixtures/demo/`** next to the test fixture (the fixture stays the
  tests'; `DEMO.md` marks the demo, the CLI syncs it to the environment **`demo`** only), the narrative key → door →
  lamp + a tally + a tap that switches scenes, six plugins as the examples to copy from. **Plugin API 1.1** (the
  smallest additions the narrative needed, the concept's shapes): `api.events` with two owners (core events are the
  engine's, scene events the book's; one flat bus, no bubbling yet), `api.vars` with the scopes spread / stage /
  session / book (a `get` without scope looks outward, innermost wins; `set` defaults to `spread`; the `node` scope is a
  component's closure), `api.progress` read-only from the app (`ArSceneOptions.progress` – the reader's history behind
  an adapter, the editor's `StageProgress`; RULES #32), `api.spread`, the context's `children`, `onUnlocked`. The
  **book variables are persisted** in the progress record as an optional `variables` map – additive within format 1
  like `onboarded`, so a MINOR. Content schema **2.7** (PLUGIN_API_VERSION lives in shared/, so the lock moves; 2.5 are the passes, 2.6 the light nodes).
- **The way to staging**: no second destination, no store change – the workflow `demo.yml` builds `fixtures/demo` and
  syncs it with the osct CLI to `<zone>/demo/`; the staging reader (a debug build) takes `?content=<base url>`; the
  staging editor imports a content base URL. Found on the way: **a publish is per environment, not per book** – a
  second book published to `staging` would replace the book's current version once the store is bunny → #87
  (Proposals, decide). Until then the demo's Publish stays `local`.
- [ ] Open: #88 (~~an animated GLB for the key, a tap button and editable variables in the Stage panel~~ – done
  2026-10-30, see above; the `behaviour` component and declared variables, bubbling scopes, two spreads on one stage); the Entity panel's rows
  now follow the engine's plugin load (`plugins.version` bumped when the scene runs) – a small fix found by the demo.

## 2026-10-29 (night) – Light nodes, content schema 2.6 (#71)

- Tilman (testing the desks on the stage): "one entity type is missing in the editor – lights" → issue #71, its own
  session. Built: node type `light` (point / spot / directional, values under `light:` from `shared/types/lights.ts`,
  spot and sun along the node's −z, default half a target width above the parent), engine builder with fade in reveal
  and outro, editor rows from the definition, tree icon, Blender-style helper on the stage, fixture lights in Studio A.
- First built as **schema 3.0** (the 2.x guard refuses a node type it does not know – the engine would have kept the
  children, but the guard throws first – so an older app cannot read content with a light: RULES #10's MAJOR); the
  #61 editor session then asked for **2.6** on top of the passes' 2.5 (a MINOR step), so it is 2.6 – the cost: a 2.5
  app shows "invalid configuration" on a book with a light instead of "update the app" (no deployed reader is on
  2.x; production is on 1.x). From 2.6 on the guard lets an unknown node type pass with a warning (the content build
  and the editor's API still refuse one); RULES #10 says so. The app reads every older MAJOR as it is
  (`OLDEST_READABLE_SCHEMA_MAJOR = 1` – every MAJOR so far only added) instead of the hard-coded "2 reads 1".
  **Units**: three.js attenuates point and spot lights in world units – metres, on a target a few centimetres wide
  a 1 cd light at 5 cm gives 400 lux, pure white – so `intensity` and `distance` are in the node's units (target
  widths) and the engine scales them by the light's world scale every frame (`scaleLight` in entities.ts); the
  reader has no tone mapping, so a lit white page clips above ~1 – the default intensity is 0.25, the fixture's
  lights 0.3 / 0.1. The fade of reveal / outro is a factor (`userData.fade`) the light node applies, not an absolute
  value the animation writes (the two would fight per frame).
  The HDRI dims only the scene's own lights (children of the scene), not the content's. Merged after #66 (2.4) and #72 (2.5).
- Open: the publish writes the imported book's schema (`books.content_schema`), not the server's – a 2.3 book
  published with a light says 2.3; the reader of the same build reads it anyway, an older reader fails on the node.
## 2026-10-29 (night) – Post-processing lives in the engine's pass registry, the code editor hooks into it (#72)

- Tilman (testing the stage, #68): "post processing, which we could just delegate to code editor, since it can handle
  stuff like that also by code right?" Decided (recommendation (c) of #72, built alone – to review): **one mechanism
  for Kévin's own passes and the ready ones** – a pass registry in the engine (`engine/src/scene/post/registry.ts`:
  `registerPass(type, spec, factory, owner)`, specs in the component spec shape) with the built-in `bloom`,
  `vignette` and `grade` registered by the engine itself; the content names passes per spread or per book
  (`passes: [{ type, …params }]`, content schema **2.5** – 2.4 is #66's plugins, its hand-over asked the next bump to
  start at 2.5); the code editor's plugin API (#66, PR #73, not merged when this was built) gets `api.registerPass`
  as a one-line delegation to the registry with the plugin as the owner (`unregisterPassesOf(id)` on uninstall),
  and the guard's `passProblems(…, { unknownTypes: "allow" })` where plugins are declared. Built on `develop`, not
  on #66's branch, so the PR stays reviewable. Agreed with the #66 session: **pass specs stay out of the component
  spec registry** (`registerComponentSpec` feeds the Entity panel's *+ component* row and the node check – a pass there
  would show on every node); passes have their own lookup, `passSpec(type)` in `shared/types/passes.ts` (the built-ins
  plus a registered spec), which the Stage panel's rows read.
- The chain keeps the AR layer's alpha (RULES #4): the scene renders into a half-float buffer (MSAA as the canvas),
  the passes run over premultiplied colour, the last pass converts to the output colour space with the alpha
  un-premultiplied and multiplied again, drawn over the screen with premultiplied blending (the look-around world
  stays under it). three's UnrealBloomPass blends with alpha 1 – the built-in bloom replaces its blend factors so
  the glow is light over the camera picture, not a black screen.
- The editor's stage: the mock stage's objects (table, book, printed images, sky) lie on the engine's
  **backdrop layer** (`BACKDROP_LAYER`, view.ts) and are drawn under the chain – the first try ran the HDRI sky
  through the bloom and the whole stage glowed white. The passes show under *rendered* only.
- Budget: a chain costs one full-screen render-to-texture plus one full-screen shader per pass; the bloom works at
  half resolution (five blur levels). Guideline: one bloom plus one or two single-shader passes per spread. **The
  S22 measurement is still open** – no phone was connected when this was built (adb: no devices); measure on the
  reader with Studio B (`adb reverse`, Chrome's performance panel) before the book names passes on many spreads.
- Open: the celebration bloom (`view.ts`, the unlock animation) is not a pass of the chain – it keeps its own
  half-size composer as before; folding it into the registry's bloom is a later cleanup.
## 2026-10-29 (night) – Code in the editor: plugins (#66, decided alone from the concept – to review)

- Tilman (on staging): own JS scripts and shaders in the editor, "wie hatte das Niantic Studio gemacht? Das war mega.
  Wichtig für Spezialeffekte für Kévin und für erweiterte Game-Logik." Decided (`agents/research/2026-10-29-code-in-
  the-editor.md`): **a plugin folder in the content source, compiled by the content build, is the way to readers**
  (type check against the engine's own API types, esbuild bundle, recorded once, declared in the configuration –
  schema 2.4); **the editor's Code tab is the sandbox** – sources in a `plugins` table, Run transpiles in the browser
  (sucrase, ~200 KB, loaded with the first Run; esbuild-wasm's 10 MB and CodeMirror were left out to keep the editor
  small), nothing of it reaches a publish (409 when nodes use a type no declared plugin provides). The plugin API
  1.0 is `registerComponent` + `registerLayer` + `api.three`; material layers are **components** in the content
  (`components: [{ type: tint, … }]`), so panel, build and guard treat them as one; GLSL never travels in content.
- Tilman answered the open questions the same night: **no sandbox in the reader** ("ich finde wir schützen schon
  genug vor Release" – the review before a release is the protection; a sandbox would cost the direct three.js
  access, the point of the API); **layers stay components** – his concern is performance, so the build warns about
  more than three layers on a node and the guide says to bake what never changes into the video; **type stubs with
  completion** – wanted, #76 (Monaco, lazily with the Code tab); **node types** – wanted, as the engine's existing
  builder contract with a small spec, #77; **the way to readers stays the content build – run on the server behind the
  publish** ("Build Option 2": Node and `scripts/` in the image, the API compiles the stored sources on publish; no
  download detour – "kind of stupid to think about"), #78; **an MCP server** over the editor's API so
  Claude builds content and plugins fast in Amsterdam, #75. Schema numbers are fine ("einfach mal weiter machen");
  how the content schema links to the app's and the editor's versions is still open.
- [ ] Open: how the content schema version relates to the app's and the editor's versions (today: MAJOR refused,
  MINOR ignored – RULES #10; the editor reads the same engine).
- [x] *(settled – the API is at 1.5, one MINOR per addition)* Open: the plugin API's own version (`PLUGIN_API_VERSION` 1.0) against app releases – bump the MINOR when the
  API grows (#77 registerNodeType), MAJOR when a hook changes meaning.
- Schema clash resolved in the merge: the covers took 2.3 on develop while this branch used 2.3 too → the plugins are
  **2.4** (RULES #23's rule for version files, applied to the content schema).

## 2026-10-29 – The stage's desk is our own Eiermann model (#68)

- Tilman: "the table should be an Eiermann"; he supplied a 3ds Max model of the frame (`01_E1_1100x660-exzentrisch`,
  17 000 triangles, kept outside the repository) and asked for an effective poly reduction, an 18 mm Siebdruckplatte
  top with the plywood's plies visible on the cut edges. Decided: **no decimation of the supplied model** – the frame's
  tube axes were measured from it and `editor/tools/desk-eiermann.py` rebuilds the table from primitives (8-segment
  tubes, 236 triangles, materials `top` / `edge` / `steel`, origin at the top's surface, metres, Y up), so the GLB is
  ours and regenerable without the source file. The desk keeps its own materials under every shading mode (like the
  gizmo and the outlines); the plies are the untinted plywood texture with its grain along the edge.
- Tilman, later the same day: **both desks as options, like the HDRI picker** – the Eiermann (default) and Philipp
  Camille Schöpfer's white desk (modelled after a photograph) – "the tool is for designers and they should feel at
  home". `desk` is a stored preview setting; the stage keeps each loaded model for a switch back and decides the
  top's look by id (plywood / white). The supplied archive carries no licence or readme, so nothing of it is
  committed – it served as the measurement reference only.
- Tilman, on seeing the panel: "there is overhead, we won't need anymore – we got the HDRI and we got the table as
  default; more basic". **The backdrops *table*, *paper* and *photo* are removed** (never shipped – 1.10.0): the stage
  has the desk always and the HDRI as its sky while rendered (the scene's lights in wire / solid / textured); the
  Stage panel keeps *desk* and *sky*.
- [ ] Open: the frames' finishes (dark metallic steel, Schöpfer's white; chrome would be a material change in the
  script) and Schöpfer's leg geometry (four straight splayed legs read from one photograph). – Schöpfer's part done
  in #187 (black powder coat, the catalogue's frame); the Eiermann's graphite stays as #184 left it.

## 2026-10-29 (evening) – The boundary: engine, reader, editor (#61, Tilman decided, then "durchziehen")

- 2026-10-29 (#65, Tilman: "bitte stark an Scutoons' Modellierung orientieren, wir werden das fürs White Label später
  vereinen"): **roles after SCUTOONS** – tables `roles` (fixed ids 1 reader, 2 editor, 3 admin) + `user_roles`
  (`granted_at`, `granted_by`: signup / migration / config / secret / the admin's id), `Roles::require()` as the guard,
  `GET /user` `roles`; `users.role` stays as a mirror of the editor role (older readers, the schema's backfill). The
  admin page lives at **`/editor/admin`** (the editor's build and `.htaccess` fallback serve it in both deploys; a root
  `/admin` would need a rewrite per deploy) – an admin who is no editor sees only that page. The admin API takes an
  admin session **or** `X-Admin-Secret` (break-glass; `admin/migrate` secret only). `ADMINS` next to `EDITORS` is the
  bootstrap (Tilman sets the GitHub variables on `staging` / `production`). The newsletter list = the users with any
  update option on (no new opt-in column – the three options are the opt-in); the reader's preferences untouched.
  Differences to SCUTOONS listed in docs/server.md "Roles".

- Tilman: "Das ist die Frage des Routings – wer für was verantwortlich ist." "Der Editor hat eine Sonderstellung:
  er braucht die Engine nur für ein Preview, der Rest ist simuliert. Daher muss da eine Grenze her." "Wieso muss
  Stage dann im Reader sein – das ist doch ein Editor." "Ich möchte eine klare Trennung. Und wenn das heißt, Tune ist
  raus, dann bitte. Es geht im Debug-Overlay nicht um Einstellungen. Das ist Legacy." Decided: **the engine becomes a
  package of its own (`engine/`: content runtime + AR scene), the reader uses it with the real tracker and carries no
  editor trace, the editor is a SvelteKit app in this repository at `/editor` that uses the engine with the mock
  tracker and owns the stage** – no `/stage` route, no stage protocol, no iframe (B with the stage in process).
  Tune leaves the debug overlay (legacy); `TUNE_ENTITY_EVENT` becomes `scene.overrideEntity()`. Design:
  `agents/research/2026-10-29-editor-architecture.md`. RULES #32 rewritten.
- Tilman: "So weit wie möglich selbstständig … bis Ende aller Pakete: Datenbank, Editor, Compilieren, Ausliefern."
  "Ich möchte die Demo-Szene am Morgen ausprobieren zu bearbeiten" – the studio spreads of the fixture must be
  editable in the editor in the morning (import from the reader dev server, edit, save, publish to the local store).
- Compile = the publish assembles the content version from the database rows (the server, PHP); the plugin compile
  (schema 2.0, code in the editor) stays phase 15 steps 3–4.
- Earlier the same day: an OSCT instance user signs in (the instance is **Building Fictions**, the brand; "OSCT wird
  das nie"), independent of Scutoons for now, "der Editor erstmal im OSCT-Repo".
- [x] The reader's vanilla editor sheet and `<scrub-number>` went with this (Tilman: clear separation) – the editor
  app replaces them; `docs/editor.md` rewritten for the app.
- Built that night (1.10.0, decided alone – to review): the editor mirrors the Scutoons apps' toolchain (SvelteKit 2.55,
  Svelte 5.55, adapter-static with `fallback: index.html`, `paths.base=/editor`, vite-plugin-svelte 7) but with the
  reader's three 0.174 so the engine compiles once; `tsconfig` overrides `verbatimModuleSyntax` (the engine has no
  type-only imports) and maps `three` to `@types/three`, Vite dedupes `three` for the engine's files. The import's
  `assetsBase` is where a book's `/assets/content/…` paths resolve (the reader dev server in dev, the CDN's version
  folder on staging) – the engine's loader got the same option so layout and trigger protocol resolve there too.
  The editor's own users are the accounts table with `users.role` (`POST /admin/editors`). Publish `local` writes to
  the API's `db/content/`, served at `/api/content/local/…`. The dev setup for the morning: `server/api/config.local.php`
  (SQLite, mail log, local store), Tilman's address already an editor there, the code in `server/api/db/mail.log`.
- [ ] Open after the night: staging's `CONTENT_STORE=bunny` + credentials (GitHub environment); MariaDB against the new
  tables; the phone layout of the workspace; entries / texts / media editing (step 2b); the plugin API (steps 3–4).
- 2026-10-29 (Tilman): the Stage panel's **view presets and found chips are removed** – they doubled the stage's own
  gestures (orbit, pan, double tap) and the tree's eye column; the replay of the first find lives in the stage's
  right-click menu. `PREVIEW_VIEWS` and `view` stay in `preview.ts` (the reader view is the double tap's target).
  Local sign-in has no hourly email limit (`LOGIN_MAX_PER_*_HOUR` -1 – Tilman: "-1 ist besser als Limit für aus";
  0 allows nothing); a refused request tells the minutes.
- 2026-10-29 (Tilman): the covers are spreads of another **format** – `format` on a spread (`spread` default,
  `cover`, `back`; later `wall`, objects, facades: "damit kann die App auch verschiedene Medien bespielen"), with a
  UI to set it; the covers are page 0 and the page after the last so the page → spread rule holds everywhere. Scripts
  and shaders in the editor (Niantic Studio's model) are issue #66 with their own session.
- 2026-10-29 (Tilman, on staging): the first editors come from the config list `EDITORS` (GitHub environment
  variable, written by the deploys) because the admin secret is not readable after it is set; a **minimal admin UI**
  at `/admin` follows (editors, later newsletter lists) – own and small, a feature set of the white-label core, not
  a copy of Scutoons' admin (PLAN 2d). Also decided: the editor's viewport follows Blender (orange selection outline,
  shading wire / solid / textured / rendered), components start with `animation` and the timeline (schema 2.2).
- 2026-10-29 (Tilman, "Ja, bau den Asset-Upload nach dem Scutoons-Modell"): built as **the content store as the
  storage** (no second driver layer: `ContentStore` learned binary files, delete and serving assets), a registry of
  assets + versions, usages computed from the rows (no usage table – the book is small), absolute URLs in the content
  (publish and engine leave them alone), replace = new path + relink (no CDN purge). Targets made in the editor carry
  `print` (schema 2.1, MINOR); their tracking data for the real reader is open (the content build's target set).
  Asked the same day, parked for steps 3–4: spread-level nodes without a target, a timeline for glb clips with
  start / stop events, the script part. The sky became a sphere in the stage group after three's background
  rotation mirrored axes.
- 2026-10-29 (Tilman, "ja bauen"): **content schema 2.0 = the node tree**, structure first, components later: an
  entity's node has `children` (placed relative to the parent), types `group` and `text` joined model / video /
  image, one node stays the default. Decided alone: the app reads 1.x content as it is (a one-node tree), so the
  schema MAJOR costs no content rebuild and no app MAJOR; unknown node types render nothing but keep their children
  (a later type is MINOR); the placement stays flat in `params` (the concept's `params` object is what we have);
  text nodes draw a canvas line in a system serif (the brand font and real typography are open); a new node in the
  editor takes a file the book already has (upload = the asset layer, open). The Blender-style tree (outliner at
  the left, chain icon for uniform scale), pan (Shift / middle / two fingers), the colour popover with the stage
  eyedropper (`IArScene.sampleColor`), the book as an object and the sheet previews landed the same day.
- 2026-10-29 morning (Tilman): the tree (outliner) at the left and the chain icon for uniform scale landed. Open
  questions he raised, to decide: how targets are placed in the editor (upload / replace a target image), asset
  resolutions (images 1x / 2x / 3x, videos 480p / 720p / 1080p) and whether Scutoons' asset layer (`scutoons/agents/ASSETS.md`:
  PHP registry + storage drivers incl. bunny, `@scutoons/media` picker and media standard) is copied for it. The local
  editor DB now holds the real book (imported from the reader dev server with the layout from the 2110 PDFs); the
  fixture's studio spreads come back by rebuilding the fixture content and importing again (same book id `osct`).

## 2026-10-29 – Editor, first step: `/editor` over the mock stage (#61, overnight after Tilman's go)

- Tilman (2026-10-28, late): "#59 skippen und direkt in diesen Editor reingehen" – the mock stage (#59) is the editor's
  preview, not a reader debug panel; onboarding steps stay out of the database; entities become a node tree with
  components and plugins (the book's own code, compiled by the content build – 8th Wall's model, verified in their
  repository: webpack per project, schemas parsed from the AST); click UI only together with code in the editor;
  events have owners (core = book logic, read-only for plugins; scene = content) and scopes `node ⊂ spread ⊂ stage ⊂
  session ⊂ book ⊂ global` (lookup outward, bubbling outward); a spread is the targets seen together, pages optional
  (record sleeve, wall, cover); the book is the first layout template, OSCT a filled instance; variables are declared
  with scope, writers and setter rules. All of it in `agents/research/2026-10-28-entity-components.md` and
  `2026-10-28-editor-data-model.md`; issues #60 (geometry from the PDF), #61 (editor), both Proposals → #61 In progress.
- Built overnight (1.10.0): route `/editor` (scan mode), `editor-page` shell + lazy chunk `src/editor/` (bar, preview
  panel), `MockTracker` behind `IImageTracker`, `MockStage` in the scene, `ArScene.ensureTracker()` picks the tracker
  when the camera would start (the editor page may become active a moment after the scene is asked to run – a first
  version started the engine once and asked for the camera), camera permission simulated while the preview runs,
  `history.forgetTarget()` for *unlock ↺*. English texts (RULES #20), RULES #32.
- Decided alone, to review: the page format is a constant (230 × 320 mm) until the content carries it (#60); the row
  layout when the protocol is missing; targets without an image are not on the stage; the preview panel opens with
  the editor; the editor's chunk imports the dev-tools barrel (already in the main bundle) and defines `tune-panel`
  itself in production builds.
- Later that night (Tilman: "use these two to create the most realistic preview mock stage you can make",
  "beim Blättern sollte auch alles passen", "front and backside bitte auch mitdenken – für dieses Buch nicht relevant,
  aber im Editor darf man dort Targets platzieren"): `scripts/layout/extract-layout.py` reads `All_Triggers.pdf`
  (129 double pages, 460 × 320 mm, every trigger as an image) and `OSCT_2110_previewLOWRES.pdf` (135 sheets: cover
  front and back as single pages, two front- and two back-matter spreads, the rest double pages with page numbers at
  the foot) → `content/layout/` (git-ignored, copied by the content build): 135 sheet images, 121 of 131 targets placed
  (the ten not on the printout: pages 30, 95, 222 have two targets and one printed image). Python chosen because
  PyMuPDF gives image boxes and renders pages in a few lines; a Node port (pdfjs + canvas) is possible when the
  import becomes part of the osct CLI (#60). The stage shows the sheet as the page texture and the targets exactly
  where printed; the covers are sheets of the layout (`cover-front` / `cover-back`, surfaces `front` / `back`) without
  a spread yet – spreads without pages are a content schema change (#60, #61 step 5).
- Morning (Tilman: "check for reference the scutoons UI dogma and libraries … reuse components as much as possible,
  save real estate"): read `scutoons/agents/DESIGN.md` (Compact inspector, One control height, Icons, Close cross,
  the phone inspector = a sheet whose head is its tab row) and `@scutoons/ui` (Svelte – not importable here; the
  patterns are). Rebuilt the editor UI as one `<editor-sheet>` (head = ‹ › · Stage · Entity · ×, closed = the head
  row), `<scrub-number>` in `components/common/` for every number (dogma: never a native slider / checkbox), the tune
  panel split into `<tune-inspector>` (shared with the debug overlay) + a thin sheet host. Kept native for now: the
  colour input (the dogma's colour popover is a later piece), the target `<select>`. RULES #32 "UI" paragraph.
- Tilman (morning): XYZ in one row like Blender – done (`<scrub-number prefix>`); "Beispielszenen für 3D-Entities und
  Shader" – the fixture got `studio-a` / `studio-b` (ten entries, every entity type, placement and filter of today's
  model, a shared entity used twice); "Event- und Variablen-Austausch zwischen Entities" – needs schema 2.0, written
  as *Studio C* in the entity concept (the acceptance scenario). Svelte: not in the reader (RULES Stack); Tilman sees
  the editor as the bridge to Scutoons that could profit from Svelte – open decision, options in the #61 comment.
  Leading zeros in ids (`s004-005`, `p004-1`): from the delivery import (`import-delivery.ts`, `padStart(3)`) so
  folders and lists sort in book order; cosmetic – the app sorts by `order` / `page`. Changing them = new ids for the
  progress (fine before release); Tilman decides.
- Tilman (morning, after seeing the shared inspector gold in the debug panel): "I want debugging look like debugging.
  The editor have a neutral color schema more like Figma. Focus on efficient space use and brand UI comes only in
  real reader facing UI elements" → three token variants in `styles/design-styles.ts`: **branded** (his word for the
  reader's, the default), **editor**, **debug** – switched by `data-theme` on the host; components carry structure
  only. Copy YAML stays until step 2 saves to the database (then redundant in the editor, as Tilman expects). Then:
  "I hate that blue grey. Use a color schema inspired by the default in figma. Day and night theme" and "Blau gar
  nicht" – the editor variant is white / light grey by day, dark grey by night (the system; Tilman: "Nacht/Tag braucht
  es nur als Flag, später ggf. in Settings" – the flag `osct-editor-scheme` exists, no button), focus and accents in
  the text colour, pressed segments grey; `branded` is Tilman's word for the reader's
  variant – the layer a white-label brand overrides later (one token block in `main.css`).
- Tilman: "Svelte als Konzept klären" → `agents/research/2026-10-29-editor-svelte.md`: A Svelte in the reader's
  chunk, B a SvelteKit app in the OSCT repo, C the editor as an app in the Scutoons monorepo on `@scutoons/ui` (a
  private source package – no publishing), the reader exposing `/stage` + a stage protocol (postMessage cross
  origin), the instance's API for saving. Recommendation was C; Tilman: "also ein OSCT-Instanzen-User" and "das Ding
  ist Scutoons-unabhängig im Moment" → sign-in with an OSCT user (editor role), not C. Open: A (Svelte in the lazy
  chunk, recommended now) or B (a SvelteKit app in the OSCT repo under /editor). Then: "OSCT wird das nie. Das ist für
  Building Fictions im Moment" (the instance is the brand, the editor belongs to it, not to the title) and "Der Editor
  erstmal im OSCT-Repo". Ids without leading zeros: #63 (Backlog). Day / night of the editor: only the flag, no button.
- [x] *(done – the stage simulates its own progress, `editor/src/lib/stage/progress.ts`)* Open: an editor-only progress – *unlock ↺* and every find write the device's progress (fine on staging, not for
  Kévin's own phone later); comes with accounts / roles in step 2.
- [x] *(obsolete – the in-reader editor is gone, RULES #32)* Open: the spread switched to the next one once when leaving the editor on the desktop (the spread menu's
  loop settling?) – seen once in the browser pane, not reproduced.
- [ ] Open (Tilman): 35 cm / 30° as the reader's view, or measure; the desktop default could start closer (20 cm).

## 2026-10-28 – Entity animations shorter (#57, Tilman)

- On the phone the unlock ran too long: by the time a video or a 3D object had materialised the reader had often
  drifted off the trigger. The durations are global for every entity type (`ANIMATIONS` in `ar/celebration.ts`,
  `ENTITY_UNLOCK_MS` in `types/scene.ts`): unlock 4.2 → **3 s**, reveal 1 → **0.6 s**, outro stays 0.7 s. Image
  targets without an entity never had the dissolve (found indicator rotation, 2.6 s) – they felt right already.
- Video suffers most because it plays from `onFound`, i.e. during the dissolve – the first seconds of motion are
  only seen through the noise mask. A model's shape is its content, the gold edge carries the time.
- [ ] Tilman tests on the phone (video and 3D target). If video still feels long: a duration factor per entity type
  passed to `celebrate()` – only after the global values have been tried (#57).

## 2026-10-28 – Direction: scutoons-animus-ar, a white-label AR core; data sovereignty (Tilman, milestone 2)

- Tilman: "game.config.json is tied to a version of the book, so current data is testing data". Goal: a bare core
  app developed as a vendor app; branded instances (Building Fictions, Scutoons) tied into their brand's ecosystem
  (WordPress or other, own editors), each with its own database and its own CDN; config and content load per book
  or game. Long term SaaS, or quick resale to publishers, museums, authors.
- Then (same day): "white-label ist ein guter Begriff" – **no platform** until there is demand, only our own
  projects until requests come; niche **art, graphic novels and the music around them**; a **contracted** model
  (people commissioned to make content for us or with us); hosting content and apps matters, delivered **under the
  brand's DNS, PWA first, native app later**, or inside our own app; **data sovereignty is the selling point**
  ("ich möchte den Tech nutzen, ohne Tracking einer anderen Firma"). Project name **scutoons-animus-ar** (the
  bridge to animism). Competitors in Vienna: Artivive (white-label WebAR), Artificial Museum (GPS AR, framework
  rented out).
- Then: "das ist das Ziel": **instances initialised at a click**, on the client's servers or on selected partners'
  (bunny, Hetzner, Amazon, Timme, whatever); the **CDN is a decisive advantage**, the audience is **products that
  travel the world**, where access times matter.
- Strategy draft: `agents/STRATEGY.md` (model, data sovereignty as of today, architecture, phases A–C, market).
  Issues: umbrella #44, decisions #45–#49, phases A #50 #51 #52, B #53, C #54 (board lane Proposals).
  GitHub milestone 2 "scutoons-animus-ar – white-label AR core" (first created as "Overprint – vendor core for AR
  books", renamed).
- Order (Tilman): first OSCT as the archetype – how it handles content independently from the app – then issues
  for the core, perhaps developed over the winter.

## 2026-10-28 – Tap to focus for every reader (#37, Tilman via #14, 1.9.4)

- Tilman: the camera default is continuous autofocus **and** tap to focus – a tap on the camera picture (anywhere that
  is not UI) focuses on that point once, then continuous focus again; for everyone, not a debug switch; no zoom.
- Built into the AR scene's tap handling: a tap that hits an entity opens its entry as before, any other tap on the
  picture focuses. Chrome on the S22 reports no `pointsOfInterest` (both lenses) – the tap can only start a new focus
  run on the whole picture, not on the point. Safari 15 has no focus controls at all.
- Branch renamed to `feature/37-camera-focus` (RULES #26); the old remote `claude/camera-focus-zoom-ffbbaa` is left for
  Tilman to delete.

## 2026-10-28 – Camera defaults: main lens, continuous focus, engine size; iOS below 16.4 cannot scan (#37, Tilman, 1.9.0)

- **The first trigger test ran on the S22's ultra-wide lens** (fixed focus, `camera 2, facing back`, 60 fps): the
  engine picks Samsung's main lens by the label `camera2 0, facing back`, Chromium now says `camera 0, facing back`
  (Chrome 156 and Brave 155 alike; the first test was in Brave). The app asks for camera 0 by device id itself
  (`camera-request.ts`, Android only). Main lens retest: 23 of the 25 misses found without zoom, only the flat logos
  p067-1 / p129-1 not (`docs/trigger-tests/2026-10-28-camera.md`).
- Tilman: "Please just do the defaults like this" – **main lens, continuous focus at start (if offered), the engine's
  960 × 720, no zoom**. 1920 × 1440 found p123-1 later (27 s vs. 14 s) and less steadily; Tilman's impression the
  same. His wish for an automatic resolution choice with a menu override is not built: no size found better on the
  S22. Revisit with a recent iPhone (second trial #36) – the **res** switch in the debug camera panel stays for that.
- **iPhone 7 (iOS 15.8.3) cannot scan**: the engine's tracking WebAssembly uses SIMD (Safari from iOS 16.4). Tilman:
  build the warning – update if the phone can, otherwise scanning does not work; a SIMD-free engine build is proposal
  #39 ("decide later"). The app cannot tell an iPhone 7 from an iPhone 8 (same screen, no model in the user agent),
  so one notice names both cases. Safari 15 reports no focus or zoom controls at all.
- **Frame rate** (~14–16 fps) is its own issue #40 (Tilman: "I want to tackle the frame rate issue by itself"); lead:
  the ultra-wide ran at 60 fps – compare with the lens switch.
- Debug overlay re-sorted on Tilman's request ("i cant close the overlay … for the camera focus test do your own tab
  which open perhapse the same slide out as the trial has"): camera panel at the bottom, × to close, QR behind a button
  ("its mostly not needed on mobile. also on the long run we need to provide this somewhere else").
- [ ] Open: where the dev QR codes live in the long run (Tilman; options: desktop only, a dev page with every spread's
  QR, or QR codes from the content build) – not filed as an issue yet.
- [ ] Open (found on the iPhone 7, not #37): the onboarding **Continue** button is unstyled on Safari 15 (likely CSS
  nesting or `color-mix()`, Safari 16.x); the trial panel's top bar cannot be dragged on iOS 15.
- [ ] Open: check the camera choice on a recent iPhone (Safari reports "Back Camera" etc.; no lens rewrite on iOS).

## 2026-10-28 – The tracker window defaults to ±1 again, not grow (#38, Tilman, 1.8.2)

- Tilman, after testers on staging (iOS among them) had trouble: the growing window "will make it really difficult for
  people to test the image targets … Until we finish this tracker window and have like a conclusive solution, we will
  not deploy it as a default." Default ±1 (the default before 1.7.0: the next and previous spread switch by
  themselves); grow stays selectable in the debug overlay. A device that stored *grow* by cycling keeps it.
- #38 goes on: diagnose grow vs ±0 on the S22, then grow or a sliding target budget.
## 2026-10-28 – GitHub Actions: minutes, notifications, runners (#42, Tilman)

- Tilman: worktree pushes and small commits to `develop` burn the account's Actions compute; no Actions mails
  ("just don't notify me"); the repository may go private, so the research continued.
- Found: OSCT is public, so its runs are free today (timing API: billable 0); the quota goes to the private repos.
  OSCT's cost per push as a private repo is measured in #42 (Checks bills 4 min for ~2 real, a PR branch runs it
  twice per push, a `develop` push 7–12 min) with options A (rules), B (trim workflows), C (local runner). GitHub
  mails the run's triggering actor and has no branch or repository filter: "failures on main only" cannot be set in
  GitHub – Actions email off, or failures-only plus a mail rule.
- Nadeos pattern for a local runner: `nadeos-cli/runner/` (Docker Desktop; develop/PR local, main GitHub-hosted,
  GitHub fallback when offline). A personal account registers runners per repository; never on a public repo.
- Decided: RULES #27 – push bundled, agents watch their runs. Actions email is off entirely (Tilman, 2026-10-28). Open
  (Tilman, #42): repository private? Then B: Checks `push` only on develop/main, fold the jobs, drop the FTPS deploy
  with the staging VM, no runner boot while SSH_HOST is missing; C only if B is not enough.

## 2026-10-28 – Trigger test S22: size, texture, camera readout (#14, Tilman, 1.8.0)

- First trigger test (Galaxy S22, printout of 121 triggers): 96 found, 25 not found, 10 not on the printout –
  `docs/trigger-tests/`. Every miss is printed ≤ 10.8 cm²; the two flat logos (p067-1 Blender, p129-1 open source)
  have 4–6 corner points against ≥ 25 for every found image – Tilman: the image type does matter. Repetitive
  images (p101-1, p096-1, p176-1) suspected.
- Tilman felt the camera did not focus. Neither the app nor the engine sets focus or zoom (engine: back main
  camera, exactly 960 × 720 first). 1.8.0 adds the camera readout and test switches (AF continuous, tap to focus,
  zoom steps, ask for zoom) to the overlay and the trial panel, before the iPhone 7 run.
- Designer report (best practice for trigger images, with examples) as a PDF outside git:
  `osct-incoming-content/trials/report-2026-10-28/`.

## 2026-10-28 – Code base review (#19)

- Findings per area with paths: the comment on #19. Fixed there: editorconfig/gitattributes, dead members, duplicate
  helpers, comments with names/dates/history/gone libraries, two TODOs without an issue, scripts tests type-checked,
  the book-content test replaced by the fixture, docs streamlined (README is the index, docs/README.md gone),
  RULES restructured. Split off: bugs #20 #21 #22 (fixed, 1.7.3–1.7.5), Proposals #26 formatter/linter, #27 naming,
  #28 typed boundaries, #29 test gaps, #30 Claude trailers in the old history (with the #5 filter-repo run),
  #31 cut PLAN/MEMORY history, #32 trigger-protocol.json and i18n types in git, #33 constant settings.
- RULES numbers are stable from now on (cited in code and issues): Server is #25 (was a second #21), Git #26,
  CI #27, Deployment #28, Issues and board #29, "Every session starts with its issue" #30, docs ownership #31.
  New in #22: a TODO needs an issue (`TODO: … (#N)`). #13 narrowed: `*Data` for the per-entity types, the two root
  documents keep their names. #17: file casing per folder (PascalCase in services/store, kebab-case elsewhere) until
  #27 decides otherwise.
- Content schema 1.1 → 1.2: only comments changed in `shared/`, but the lock covers the whole folder (RULES #10).
- [ ] Open (#5): the `content/` fallback in `scripts/src/config.ts` (the "while it is in git" CI step is gone) goes with
  the content removal; RULES #8 says so.
- [ ] Open (#28): `PlacementData` (`shared/types/placement.ts`) is unused – type `EntityData.params` with it or drop it.

## 2026-10-28 – The trigger trial runs at ±0 (#14, Tilman, 1.7.8)

- Tilman: "the trial run should not do the grow loading window. just next next next. i want to be sure it is not
  hitting performance limits that have nothing to do with the image tracking algo engine itself".
- While the trial panel is open the tracker holds the current spread only (`setWindowOverride(0)`, in memory, not
  stored): no growing window, nothing prepared or preloaded for other spreads. Closing restores the stored setting.
  Grow vs. ±0 is diagnosed separately (`docs/tracking.md` "A page is not found…").

## 2026-10-28 – Content out of git, prepared: fixture, source outside, filter-repo tried (#5, Tilman, 1.7.6)

- Tilman: "bereite das Entfernen von content/ aus Git inklusive History vor (Fixture für CI und Tests,
  Content-Ordner außerhalb, filter-repo-Plan). Den Force-Push mache ich selbst nach Absprache."
- **Fixture** `fixtures/content/` (916 KB): the former `content-demo/` slimmed (images ≤ 400 px, two-second
  160 px videos – the alpha webm stays VP8 with alpha, models replaced by the small castle). All 44 client test
  files pass on it as on the book (the tests were content-agnostic already); CI builds it
  (`OSCT_CONTENT_DIR: fixtures/content`) and still builds `content/` while it is in git. `FIXTURE.md` marks it:
  the build copies it into the output, `osct content sync` refuses such a build.
- **Content source**: `OSCT_CONTENT_DIR` (relative paths now resolve from the repository root, not the working
  folder), loaded from `scripts/.env` by `config.ts` for every command; no `book.yaml` there → the build stops,
  no fallback (a fallback to the fixture could have deployed it). Copied to `C:\Development\osct\osct-content`
  (`content/` from the main checkout with its 16 videos, `content-demo/` full size). The workflow "Content" lost
  its sync – a checkout has no content.
- **filter-repo tried** on a fresh mirror clone: 192.8 MiB → 28.4 MiB with the path list in
  `docs/content-out-of-git.md` (content, content-demo and content of earlier layouts: `videos/`, `beta/`,
  `targets/`, `.mindar/`, page images, committed build output). `main` still tracks
  `client/public/assets/content/` (build output from before 2026-09-28) → release the content-free tree first.
  The repository is public; GitHub keeps old objects through PR refs until GitHub Support collects them.
- [x] *(decided 2026-10-30: kept locally – docs/content-out-of-git.md step 2)* Open (Tilman): where `osct-content` is backed up (private repository or the storage zone) – before the
  rewrite, the history is the only other copy.
- [x] Deploys build with `VITE_CONTENT_BASE_URL` (1.7.9, #6: Kamal image + FTPS staging). [x] Done: `Dockerfile`
  without `COPY content` with the removal commit – then the removal commit, release, freeze, rewrite, force push (Tilman), GitHub Support.

## 2026-10-28 – Content deployment apart from the app: versions + strict purge; content schema MAJOR.MINOR (#5, Tilman, 1.7.6)

- Tilman, in order: "i dont want to end up with multiples on the server that eat up storage", "one folder each
  environment only", "there will not be any content in git … content CDN!", "please split content deployment from
  app deployment carefully", "use perhaps a osct-cli to sync cdn. where we trigger this we will find out". Then,
  after the in-place sync (one folder per environment, files overwritten) was built: "jetzt haben wir dasselbe
  Problem mit dem Cache, der sich nicht updatet auf den Pullzones … Ich möchte gern, dass trotzdem die Versions
  hochgeladen werden … und dass wir eine Option haben im CLI, dass wir alte Versionen purgen können. Und dass da
  vorher gecheckt wird, ob die gerade in Benutzung sind oder nicht. Strikt sein." → versions back, plus purge.
  "Wir brauchen jetzt nicht unbedingt auf Kompatibilität anpassen" (restructuring phase).
- Why versions: the pull zone caches 30 days, ignores query strings and the CLI cannot purge the edge – a file
  overwritten in place stays stale at edges (seen 2026-10-28: a deleted version's game.config.json was still a
  cache HIT). Immutable version folders never go stale; only `latest.json` moves.
- Why not the first design of this work (`<version>-<hash>` folders, upload on every push, nothing deleted): the app
  version was in the hash (every app bump = new 20 MB folder) and old versions piled up.
- **Storage**: zone `osct` (Frankfurt, Singapore, New York), pull zone `buildingfictions.b-cdn.net` (→
  `cdn.buildingfictions.com` with #17). Per environment: `latest.json`, `versions.json`, `<build>/` (12-hex content
  checksum) with `game.config.json`, `files.json`, `assets/content/…` (`shared/types/content-manifest.ts`).
- **osct CLI** (`scripts/src/cli.ts`, `npm run osct -- …`, bin `osct`): `content build | status | sync | purge`.
  sync skips a version that is complete on the storage (rollback = sync an older build: only `latest.json`
  moves) and refuses when the build lacks videos the current version has (`--without-videos`). purge keeps the
  current version, the one the CDN's `latest.json` names, the newest retired (`--keep 1`) and anything retired
  < `--min-age 30` days; refuses on missing/inconsistent `latest.json`/`versions.json`; unknown entries only with
  `--unknown`. `content.yml` is a manual button (status / sync / purge, dry run on by default) – nothing on push.
- **Content version** = `version.hash` (content + build logic + shared, not the app version); `version.version` is
  information only. **Compatibility**: `CONTENT_SCHEMA_VERSION` `MAJOR.MINOR` (1.1 since the manifest types went
  into shared/), another MAJOR refused, any MINOR loads; `shared/content-schema.json` + test force a bump on any
  change in `shared/`. Investigation behind it: by rule only a MAJOR app-version difference refused content, in
  practice the guard refused any contract change and such changes shipped as patches (1.3.2, 1.5.1).
- **App**: CDN builds read no content (`virtual:osct-game-config` null, `prebuild` skips the content build, splash
  and home-screen name from the CDN's current version). Runtime: `latest.json?t=<minute>` (no-cache) →
  `<build>/game.config.json` + `files.json`. Service worker: one content cache, `latest.json` network-first; a new
  build in `latest.json` drops the other versions' files.
- Verified 2026-10-28 on staging (content.yml runs on the branch): version `6448aacb4ab7` (452 files, 33.9 MB, no
  videos – CI checkout) uploaded, `latest.json` + `versions.json` written, the CDN serves it; the dev app with
  `VITE_CONTENT_BASE_URL` loads latest.json → `6448aacb4ab7/` and its images from the CDN. A CDN-mode app build
  ran with no content on disk. purge was not run against the storage – the auto-mode classifier refused a push
  trigger that deletes; it is unit-tested (`scripts/test/content-sync.test.ts`).
- [ ] Open (Tilman): `staging/` still holds the leftovers of the in-place sync of the same day (`game.config.json`,
  `files.json`, `assets/` at the environment root). `npm run osct -- content purge --env staging --unknown`
  (or the Content button with "unknown") removes them – try `--dry-run` first.
- [x] *(done – in place 2026-10-30, docs/content-cdn.md)* Open (dashboard, Tilman): edge rule `*/latest.json` → cache time 0, or "Vary cache → URL query string"
  (checked 2026-10-28: query strings still ignored). Until then an edge can hand out the previous version for up
  to 30 days.
- [x] CORS (checked 2026-10-28): `latest.json`, `game.config.json`, `files.json` and `.jpg` send
  `Access-Control-Allow-Origin: *`. Models and videos not checked – none in the CI sync.
- [x] 1.7.9 (#6): the image build passes `VITE_CONTENT_BASE_URL` (GitHub environment variable `CONTENT_BASE_URL`,
  `config/deploy.yml` builder.args → `Dockerfile` ARG), the FTPS staging deploy too. [x] `Dockerfile` dropped
  `COPY content` (with the removal commit, docs/content-out-of-git.md step 1).
- [x] *(done – the history was rewritten 2026-10-29; GitHub's cached views: docs/content-out-of-git.md step 7)* Open (Tilman): content out of git, history included ("aus dem Git … raus purgen, auch in der History, dass das
  Repository wieder klein und handelbar wird") – prepared, see the entry above and `docs/content-out-of-git.md`.
- [ ] Open: #15 – trial videos go through the same sync once they are part of the content folder outside git.
## 2026-10-27 – Sessions start with their issue; deploys move issues on the board (Tilman, 1.7.1, #11)

- Tilman: "every session should start with their respective issue number. look for an issue first, if one exists, and
  if not create one an analyse what stage it will enter the board." → RULES.md "Every session starts with its issue"
  (lanes for a new issue: In progress / Backlog / Proposals), pointer at the top of CLAUDE.md; the OSCT sessions of the
  day were told by message.
- #11 (Tilman said "start issue #11" = wanted): `board-status.yml` runs on `workflow_run` of the three deploy
  workflows, so the deploy files stay untouched. Agent decisions: `Refs #N` moves nothing (a step, not finished);
  only forward (Deployed / Done stay); a Kamal run with a skipped Deploy step does not count; the built-in board
  workflow "Item closed → Done" from the proposal stays off – it would skip Deployed. Dry-run against real runs.
- [ ] Open (Tilman): repo secret `PROJECT_TOKEN` (classic PAT, scope `project`); runs only once on `main`.

## 2026-10-27 – Preload flow analysis, engine view and load test (Tilman, 1.7.0)

- Tilman's idea: once a spread is found, preload the spreads around it in the background and switch to them, until
  eventually every target is loaded. With the trial content (87 spreads, 131 targets, mostly 1–2 per spread) the ±1
  window holds only ~3 spreads / 4–5 targets, so only the next and previous spread switch by themselves. Tilman: he
  will regroup the content ("I will have to group better"), and wants an incremental way to find how many targets
  the engine can hold ("how wide we can scale the window").
- Engine internals read from `xr-tracking.js` (`@8thwall/engine` 0.1.0): `configure()` unloads targets not listed,
  keeps loaded ones, queues new ones and extracts **one per animation frame** on the main thread; every configure
  **cancels and re-queues** what is not extracted yet; `reality.imagescanning` fires when the queue is empty (no
  per-target event). No target limit in the code. A spread switch configures twice today (current, then window).
- Built (1.7.0): overlay "Engine" lines (current ◉ + held spreads with target counts, ready/held, extracting,
  preparing; `E<ready>/<held>` in the summary), published by the tracker through `ar-bridges/utils/tracker-debug.ts`.
  Load test panel (overlay → *load*, `ar/load-test.ts`, `dev-tools/load-test-panel.ts`): the tracker's
  `holdTargets()` replaces the window with the current spread + N nearest targets (no automatic switch meanwhile),
  steps 0/5/10/20/40/80/all; lens cover detected by camera brightness. `docs/tracking.md` documents flow, test and
  options.
- Tilman, same day, after a phone trial: "I still want to switch pages – always test the entire app". So the load test
  no longer pins the spread: it sets a **target budget** for the normal window (`setTargetBudget()`,
  `prepared-spreads.ts`), the window follows the scanned spread, pages switch, and the content preload follows the same
  window (`PreloaderService.preloadSpreads()`, nearest first – before, content was always ±1). The window is now nearest
  first for ±n too.
- **Preload direction** (Tilman): preload everything eventually, in steps – targets, then content, then higher
  resolutions (1x/2x/3x images, video levels – issue #13); caching (service worker, browser, Bunny CDN server-side
  cache – Tilman assumes the CDN has one, not checked) means a window preloaded once comes back sharp later.
- **Trial panel** (Tilman): no notes, no slow/flicker/no buttons, header only the number not found; small strip whose
  height is dragged by its top bar (`osct-trial-height`); thumbnails, tap → that spread, ‹ › spread buttons (the panel
  covered the app's own navigation and adjacent pages were not always found). Clicking *trial* again closes it (×
  too). Report = targets not found + list of found. Old marks (`osct-trial:<book>`) are no longer read.
- All of this is 1.7.0 (1.6.1 was never committed or shipped; folded in with the growing window).
- **First load test result** (Tilman's Android phone, Chrome 155, dev server, 18:18 UTC; label says 1.6.0 because the dev
  server was started before the bump): 2 → 131 targets held made no measurable difference – engine = page fps
  12–18 at every step (13.6 at 2 targets, 18.5 at all 131), stutter frames ~70–80 per 6 s at every step, tracking 100 %
  found / 0 lost at 83 and 131 targets, best re-find ~0.5 s at 2, 24 and 131 targets (the 3.8–7.9 s outliers came with
  page changes / handling, not with load). JS heap flat 32 MB. The cost of more targets is only the one-time work:
  ~0.16 s prepare + ~0.19 s extract per new target on the main thread (+50 targets: 7.8 s + 9.4 s).
  → Holding the whole book is affordable; build it up incrementally (nearest first, in idle time) instead of up front.
  → The real problem is the **base frame rate (~14 fps, almost every frame > 50 ms) even with 2 targets** – before it
  was ~34 fps on the S22 (2026-09-28). Not caused by the target count; cause open.
- **Videos out of git** (Tilman: "leave them out. i believe i have a seperate cdn sync setup? if not we need to add
  one … a sepearte issue that follows the setup of the bunny cdn"): `content/entries/*/video.mp4` git-ignored (117 MB,
  16 files); the content build turns a missing entry video into a warning (target without AR video) so CI and deploys
  still build. No CDN sync exists in the repo (checked) – issue #15 (Backlog), after #5 (bunny.net).
- **Growing window** (Tilman: "Build the growing window: hold the current spread, then add the nearest spreads in idle
  time until the whole book is held"): default `grow` setting (`prepared-spreads.ts`, stored `grow`), tracker
  `growTargets()` – batches of ≤ 3 targets (whole spreads), each after the previous is extracted (the engine cancels
  and re-queues on every configure, so batches must not overlap), 150 ms pause + `requestIdleCallback`; a switch only
  re-orders the queue, nothing is unloaded; `prepareTargets()` (fixed window / load test) ends the growth. Content
  preload stays ±1 in grow mode (the media step comes later). A device that cycled the old setting keeps its stored
  ±n until cycled to *grow*.
- [ ] Run the load test on an iPhone; check the growing window on the phone (time until the whole book is held,
  stutter while it grows).
- **Grow on the phone (Tilman, same evening, A3 printout):** with all 131 held (overlay 131/131 ready, current
  s004-005), pages 4–5 that were found at once at the start were **not found at all**, and some images became slow to
  find. The engine's native matcher is global (`DetectionImageMatcher` with LSH tables over all loaded targets – strings
  in the wasm), so more targets dilute the matches for a weak target; on the dense printout every other trigger in view
  is now also a loaded target that can be tracked or switch the spread. The load test missed it: it re-found only the
  scanned page's (strong) target. Open: tell the two apart (cover the neighbouring images, or ±1), then cap what the
  engine holds (nearest targets up to a budget) while the cheap part – downloading and preparing target images – can
  still grow to the whole book.
- [ ] Find why the base frame rate is ~14 fps (production build vs dev server, overlay/panels, video textures,
  look-around, content preload in the background).

## 2026-10-27 – Trial content: delivery 2110 imported, trigger protocol (Tilman)

- Building Fictions delivered the trial content (`C:\Development\osct\osct-incoming-content`, 1.5 GB): `00_Glossary.zip`
  (90 pairs `P<page>_Print_<n>.jpg` = the image as printed, `P<page>_Online_<n>.jpg` = the colour original for the
  entry), `00_Links.zip` (43 screenshots `OSCT_Ref_<name>`, no page in the name), `00_Documentation Works Kevin.zip`
  (16 videos `P<page>.mov/mp4`, up to 195 MB each), `2110.zip` (`All_Triggers.pdf` – 129 spreads with the 121 printed
  triggers in place, the trial printout; the book as PDF, print and low-res; back covers). No texts, titles or
  URLs yet – every title and body is a placeholder.
- Mapping (`scripts/import/2110.yaml`): the 121 triggers of the PDF matched against the delivered files by page and
  appearance (24 px greyscale correlation, ≥ 0.73 for 119; `p063-1` → Disney City and `p171-1` → Rutt are uncertain –
  the printed crop differs). 79 are glossary images, 42 link screenshots. 10 Print images are **not** in the PDF
  (p. 2, 30, 34, 35, 95, 100, 106, 158, 192, 222 – imported with targets, not on the printout; p. 130 was listed here in error, corrected 2026-10-28) and the links
  `Evangelion_02`, `Vonnegut_02` have no place in the book (not imported). The videos sit on the trigger of their
  page where there is exactly one (category → `video`), on a link trigger for p. 103, 132, 148 (kept `link`, video
  attached, note) and without a target for p. 99, 116, 127, 146, 191, 218, 255 – which image triggers them is a
  question for Kévin. `text-placeholder` keeps the Texts category (tests need every category).
- Decisions: content ids `p<page>-<n>` (n = reading order on the page) until titles exist – rename before the
  release, not after (progress is keyed by id). Spreads only for pages with an entry (`s038-039`), one per pair of
  facing pages; the menu lists only spreads with targets anyway. Target images ≤ 1600 px JPEG in `content/`
  (the build still copies ≤ 1200 px to the client), link PNGs flattened to JPEG. Videos re-encoded on import
  (ffmpeg), not committed as delivered. `content/` is ~100 MB now – the CDN issue (bunny.net) becomes relevant.
- The placeholder content moved to `content-demo/` (build with `OSCT_CONTENT_DIR=../content-demo`); it keeps the
  examples for every entity type and the chroma key. Nothing deleted.
- Protocol (Tilman: "doesn't need to be printed – the checklist in the debug overlay is fine, with a report md file
  to forward to the designers"): `<trial-panel>` (overlay → trial), marks per target in `localStorage`
  `osct-trial:<book>`, report `trial-report.ts`; `npm run protocol -- import/2110.yaml` writes
  `client/public/trigger-protocol.json` (delivered file, mm, position per target) for the panel. The printable HTML
  of the first draft was dropped the same day.
- Phone on the dev server: the overlay's QR code now shows the Wi-Fi address of a physical adapter (was the first
  interface: WSL/Hyper-V 172.31.x) with the port of the running server. Camera needs https on a LAN address →
  `client-https` (5173) or USB + `adb reverse` (memory "Phone testing from the PC").
- **Media quality** (Tilman, same day): production images will be **WebP**; the content builder should write three
  quality levels (images 1x/2x/3x, videos 480p/720p/1080p) and the app pick by bandwidth – modelled on SCUTOONS'
  "Media quality" account setting (auto / low / medium / high, suffix naming `.2x.webp` / `.720p.mp4`, automatic by
  `saveData` / `effectiveType` / `downlink` + a 512 KB probe). Issue #13 on the board has the research and scope.
- [ ] Open: trial on the printout (S22, iPhone) → results; texts and URLs from Kévin; video ↔ trigger questions above;
  whether the 10 Print images missing from the PDF are printed in the book.

## 2026-10-27 – Sign-in mails through Amazon SES (Tilman, asgerb)

- asgerb: Building Fictions' apps send mail via **AWS SES, eu-west-1**; the entire domain is verified, so any sender
  address at it works with the right credentials. Tilman: make the mail setup part of the production deployment.
- Built (1.5.3): `config/deploy.yml` defaults `SMTP_HOST` to `email-smtp.eu-west-1.amazonaws.com` (587, STARTTLS) and
  `MAIL_FROM` to `no-reply@buildingfictions.com` – an environment only sets `SMTP_USER` + `SMTP_PASS` (SES SMTP
  credentials, one pair per environment). `deploy.yml` fails before Kamal when `MAIL_TRANSPORT=smtp` and they are
  missing. `server/deploy/mail-test.php` (in the image: `/opt/osct/mail-test.php`) sends one test mail;
  `server/deploy/ses-smtp-password.php` derives the SES SMTP password from an IAM secret key (SigV4, fixed date
  11111111, message SendRawEmail). The API's `Smtp.php` (AUTH LOGIN, STARTTLS) needs no change for SES.
- Assumed, to confirm with asgerb: the verified domain is `buildingfictions.com`; the account has production access
  (out of the SES sandbox) in eu-west-1.
- [ ] Open: SES SMTP credentials from asgerb / Building Fictions → GitHub environments `production` (and `staging`);
  then `mail-test.php` against a real inbox. Issue #12 (milestone Release Japan) is written for asgerb; his
  collaborator invite (write, sent 2026-10-27) is pending – assign #12 to him once he has accepted (Tilman).

## 2026-10-27 – Deployment with Kamal; issues on the OSCT board (Tilman)

- Tilman: "rework deployment for ssh server with kamal docker containers … main deploys to prod and develop to stag";
  staging = https://osct.porschuetz.de, production = https://osct.buildingfictions.com; osct.netlify.app (a clone of
  the staging frontend) is abandoned now. Built as 1.5.3: one image (`Dockerfile`), `config/deploy.yml` +
  `deploy.staging.yml` / `deploy.production.yml` (service `osct-staging` / `osct` – both may share one server),
  MariaDB 11.4 as a Kamal accessory per destination, migration in the container's entrypoint, `.kamal/secrets` only
  references environment variables. Workflows `deploy-staging.yml` / `deploy-production.yml` → `deploy.yml`;
  `release.yml`, the FTPS upload (`write-config.php`) and the Netlify files are gone; `tag-version.yml` stays.
- Decisions: Apache + mod_php (the two `.htaccess` files keep working as on the shared host), client IP from
  kamal-proxy's `X-Forwarded-For` (rate limits per IP), `.gz` copies served without `Content-Encoding` (the app
  unpacks), errors to the container log. Image checked locally (`docker build`, SQLite run: health, SPA fallback,
  headers, API routing, content types). Not yet run against a server – the server and credentials are open.
- Staging host (Tilman, same day): osct.porschuetz.de is the all-inkl shared host without Docker. Decided: a **staging VM
  on the production server** (asgerb) instead of a second deploy method; until then `deploy-staging-ftps.yml` (the old
  upload, marked temporary) keeps staging alive and the Kamal staging deploy skips with a warning (no `SSH_HOST`).
- Mail (same day, from a parallel editor – not this session and not the CDN session; Tilman to confirm): Amazon SES
  eu-west-1 as the SMTP default in `config/deploy.yml`, a "Mail configured?" step in `deploy.yml` that stops a
  deploy with `smtp` but no credentials, `server/deploy/mail-test.php` (test mail from the container) and
  `ses-smtp-password.php` (IAM secret → SES SMTP password), docs/deploy.md "Mail (AWS SES)". Kept as is;
  `.dockerignore` lets `mail-test.php` into the image.
- Credentials: a colleague (GitHub `asgerb`) fills them in – issue "Credentials and access for the Kamal deploys"
  lists every variable and secret per GitHub environment; docs/deploy.md "Configuration" is the reference.
- Tracking: GitHub project **OSCT** (users/mandymozart/projects/5), copied from the SCUTOONS board (lanes Backlog ·
  Proposals · In progress · Review on staging · Deployed · Done), labels like SCUTOONS, milestone `Release Japan`
  (production launch; made by the CDN session, which also owns "Host content on bunny.net CDN"). Rule in RULES.md
  "Deployment".
- [ ] Open: first `kamal setup -d staging` / `-d production` once the server exists; DNS of both domains; move the
  staging users database from all-inkl; shut down Netlify + all-inkl (issues on the board).
- [x] Deploys move issues on the board like SCUTOONS / Nadeos – built in 1.7.1 (#11, entry above).

## 2026-10-02 – Content editor: not built (Tilman)

- Researched a standalone, reusable content + 3D scene editor (`agents/research/content-editor.md`). Tilman: "we will
  be fine with just tweaking and using the agent" – **abandoned for now**; content changes go through Claude Code.
- [x] Built in 1.5.1 (branch `tune-panel`, 2026-10-03): on-phone tune panel in the debug bar (placement sliders on the found target, "Copy YAML" with
  the file path) pasted into a Claude session – avoids the USB tunnel for tuning on staging.
  Tilman (2026-10-03): **every** adjustable parameter (placement, all filter parameters), slider **plus a number
  field** for exact values; rows labelled with the three.js names (`position.x`, `rotation.y`, `scale.z`); the panel
  opens with the values currently in the content. Copy = only values that differ from the defaults.
  Built: `dev-tools/tune-panel.ts` + `tune-values.ts` (rows from `PLACEMENT_PARAMS` – new in shared placement – and
  `FILTERS`), `TUNE_ENTITY_EVENT` → `<ar-bridge>` → `IArScene.tuneEntity` (placement in place, chroma key uniforms in
  place, otherwise the entity is rebuilt; tuned values survive spread switches until "Back to content"). Typed
  placement values may leave the slider range (content accepts any finite number), filter values may not.
  `keyMode` moved to `shared/types/filters.ts` (the panel must not import three.js). Look-around section later.

## 2026-09-28 – Look-around world / world tracking research (Tilman)

- Idea (Tilman): a reader who turns the phone from the book (e.g. to the sky) ends up inside an **alien coffee
  shop** – like 8th Wall's `aframe-sky-effects-example`. Question: can image tracking and world tracking be combined?
- The shipped engine `@8thwall/engine` (MIT) has **image targets only**: no SLAM, no sky segmentation
  (`LayersController` does not occur in the package); `ar/tracker.ts` runs with `disableWorldTracking: true`.
- SLAM + image targets + Sky Effects together exist only in 8th Wall's **engine binary** (github.com/8thwall/engine,
  limited-use licence): no products offered for a fee whose value comes substantially from the software, no
  changes to it, credit to Niantic Spatial, either side may end it with 5 days' notice (then the binary must be
  removed). Too risky for a book sold for years → **not used**.
- A sky or a room around the reader is far away: rotation (gyroscope, 3DoF) is enough to feel inside it, on iOS
  and Android, with the current engine. Walking around inside it (6DoF) is not possible this way.
- **Decided:** 3DoF look-around, part of **Phase 10 (later, concept first)** – nothing built now, Phase 14 stays the
  focus. Work on branch `spatialisation`.
- Other engines compared (same day): Blippar WebAR SDK (image tracking on top of its SLAM – the one web option with
  both at once, paid), Zappar (switches image ↔ world), WebXR + App Clip (Variant Launch; WebXR takes the camera
  from the tracker), AlvaAR (SLAM in WASM, GPL-3.0 – would make the app GPL), native app. Onirix closes 09/2026.
- **Then built (Tilman: "do 1 and 3 together", sandbox branch, no permission questions)** – 1.5.0 on
  `spatialisation`: level 1 = café anchored to the book's direction (from the page anchors × device orientation),
  turned by the gyroscope, re-anchored on each find; level 3 = own sky key on the engine's camera video (the engine
  plays the stream in a hidden `<video>` next to its canvas – `ImageTracker.cameraVideo`). Rendered into its own
  target and composed under the AR scene (`ArView.underlay`) – same renderer, a second three.js `Scene` (RULES #4
  amended). Checked on the desktop with a synthetic camera; not yet on a phone.
- S22 test with Tilman (same day): works; the café floor covered the book → window widened, the world clears below
  40° down. Then Tilman: "make it less resource intense, super basic – we add the scene in the content phase with
  Kévin": the 3D café (own scene + render target) was dropped; the world is now a placeholder colour computed per
  pixel in the one composite pass (no scene, no render target – RULES #4 amendment reverted). Sky key 5 taps.
- Tilman: both effects are **reader options** like sound – Info → Settings, "Onion sky" and "Scene around the
  book" (`GraphicsService`, localStorage `osct-graphics`, default on) – so phones can save the power for the page
  scenes. The `localStorage["osct-look-around"]` switch is gone.
- Then (Tilman, phone test): "add a few things to the café, objects here and there" and "the slow part is the sky,
  it is a video filter" → objects as analytic shapes in the same pass (orbs, table discs, cubes, planet, grid floor);
  the sky test reads a 160 px canvas copy of the camera, drawn every other frame (was a full VideoTexture upload per
  frame). Façade fix: grey sky must not be warmer than neutral. S22 (dev server): ~27 fps with both on; the
  on/off measurements were too noisy to show the effects' own cost.
- Tilman, end of the session: both effects **off by default** for now; refactor + short docs; parked until the
  content discussion with Kévin (PLAN Phase 10 has the questions). Code split into `book-anchor.ts`, `sky-sample.ts`,
  `shader.ts` (placeholder world in its own GLSL block), `look-around.ts`; the gyroscope is read only while an option is
  on; `ArView.underlay` is an object with `active` (no clear when inactive).
- [x] *(done – the book's environment, schema 2.8 / 2.10)* Open: the world is a placeholder in the shader (`PLACEHOLDER_WORLD` in `look-around/shader.ts`) – the real one comes as
  content in Phase 14 (RULES #5).

## 2026-09-28 – Content build output not in git (Tilman; branch `build-content-in-ci`)

- `client/src/game.config.json` and `client/public/assets/content/` are ignored and untracked. `npm run build`
  in `client/` builds the content first (`prebuild` → `npm run content` = `npm --prefix ../scripts install` +
  `npm --prefix ../scripts start`). So nothing changes in the deploy commands: the staging workflow, the
  release workflow and both Netlify sites (base `/client`, `npm run build` – read from the Netlify API) build
  the content of their commit. Fresh build incl. content: ~25 s locally.
- Checks: the "committed game configuration is up to date" diff is gone; the scripts job still builds the
  content (content errors fail), the client job runs `npm run content` before `tsc` / `vitest`.
- `vite.config.js` stops with "game.config.json is missing – run `npm run content`" on a fresh checkout
  (dev server and vitest), instead of a bare ENOENT. The broken `build:config` script is gone.
- The config's `timestamp` is now the build time of each deploy; the content cache key stays the content
  hash (`version.hash`), so a deploy without content changes keeps the phones' content cache.
- Landed on `develop` 2026-10-20 as **1.5.2** (Tilman: "merge"), after merging 1.4.0–1.5.1 into the branch.

## 2026-09-28 – 1.3.2: MindAR leftovers cleaned up (Tilman)

- Targets are keyed by **id** everywhere (tracker `onUpdate(targetId)`, scene anchors, poses): MindAR's
  `index` (position in the `.mind`) is gone from `TargetData`, guards, client types; target `order` gone from
  the schema and all 35 `entry.yaml` (the validator ignores it if left in). Entries sort page → title. The
  build only checks the 10-per-spread limit (`checkTargetsPerSpread`). A test asserts unique target ids.
- `.mindar/targets/` (49 files) had been committed with 1.3.0 by mistake (its ignore rule was removed while the
  folder still existed) – removed from git, `.mindar/` ignored again (other machines may still have it).
- [x] Tilman asked why the generated content is committed: the deploys only built `client/`. Decided
  (Tilman: yes) → the output is no longer in git (branch `build-content-in-ci`, entry above).

## 2026-09-28 – 1.4.0: optional password, one sign-in form (Tilman)

- Why: "Register" and "Login" were the same step (the email creates or signs in), but "Register account" made
  returning readers think the form was not for them. Now "Send sign-in link" + a line for readers already
  registered on another device.
- Tilman: fields must work with password managers; add an **optional password** – the sign-in link stays first
  and required for the first sign-in (it confirms the address), then the reader may set a password or keep using
  the link. Password configured on the server and hashed properly.
- Decisions: bcrypt via `password_hash()` (cost 12, portable across shared hosts – Argon2 is not everywhere),
  max 72 bytes refused rather than cut; same 401 for unknown address / no password / wrong password; 10 failed
  sign-ins per address and 30 per IP per hour. Changing needs the current password unless the device signed in
  by email in the last 15 minutes ("forgot password" = sign in with the link, set a new one). No "password
  changed" email yet.
- Schema changes are now additive `ALTER TABLE … ADD COLUMN` at the end of the schema files; `Db::migrate`
  skips a column that exists (MySQL 5.7 has no `ADD COLUMN IF NOT EXISTS`).
- Password managers: the account section is in shadow DOM; fields carry `autocomplete` + names, the set-password
  form has the email as a hidden `username`. Chromium also gets `navigator.credentials.store()` (explicit save
  prompt). Not yet checked on iOS (keychain + shadow DOM).
- Tilman: "Sign in with password" is **not a button** – a text link on the same line as the "Send sign-in
  link" button (new primitive `.text-link`, RULES #18). Fields take the full width so button + link share a line;
  link texts kept short so they fit at 375 px in en/fr/nl/de (fr "Recevoir un lien" / "Avec un mot de passe",
  de "Mit Passwort" / "Mit Link").
- 1.4.1 (Tilman): **no "Remove password"** – once set, a password can only be changed (button, service method,
  `DELETE /user/password` removed).
- 1.4.2 (Tilman): debug top line `◉ spread1 T4 F[…]` – no "S" (the dot's color says it), no A (assets on the
  spread) / U (unlocked targets) / K (consulted entries): unclear letters; U and K are in the progress panel.
- [ ] "Password changed" notification email (mail texts en/fr/nl/de) – not built.

## 2026-09-28 – 1.3.0: 8th Wall only, MindAR removed (Tilman: "move to 8th Wall entirely")

- Why (Tilman, after the S22 tests): MindAR "doesn't do well at all" next to 8th Wall (jitter), and it cannot
  switch spreads by itself. The full-spread photo targets (pages 20–27) work with 8th Wall too (Tilman).
- `develop` (1.2.2, incl. the fresh `compile:mind` tooling) was merged into the exploration branch first, then
  everything MindAR went: vendored build + TF.js, `ar/tracker.ts` (MindAR port), `create-tracker.ts`, the engine
  choice (`VITE_AR_TRACKER`, debug toggle, `MA`/`8W` prefix), `scripts/src/mind/` + `compile:mind` /
  `mind:*` commands, `lib/local-folders.ts`, `lib/cli.ts`, `lib/console.ts` (only the mind tools used them),
  `playwright-core`, `@msgpack/msgpack` (client, only the `.mind` test), all `.mind` / `.mind.sha256` files,
  `mind:` in `spread.yaml`, `mindSrc` + `maxTargetsPerSpread` in the game configuration, `.mindar/`.
- Decisions (Tilman): **max 10 targets per spread** (RULES #3); **±1 spreads kept loaded by default** (the
  debug overlay setting stays). `ImageTracker` (ar/tracker.ts) is the 8th Wall tracker behind `IImageTracker`.
- Preloader + whole-book download fetch target images instead of `.mind`. Engine files (`assets/xr8/`) are
  precached with the app shell (offline AR; precache 24 entries / 6.0 MB raw) and ship with their LICENSE;
  credited in the project README (Tilman: not on the Info page) – "open source image tracking engine of
  8th Wall by Niantic Spatial, the discontinued 8th Wall platform, MIT".
- RULES #4 now names the one allowed extra WebGL context: the engine's camera canvas.
- **Version 1.3.0, not 2.0.0** (Tilman asked why MAJOR): first bumped to 2.0.0 because the game configuration
  lost `mindSrc` / `maxTargetsPerSpread` – but by RULES #23 nothing broke: old `spread.yaml` (with `mind:`)
  still builds (unknown fields are ignored), the configuration is regenerated with every version and ships with
  the app, and the progress shape is unchanged. So MINOR. 2.0.0 was never tagged or merged; the format-2
  progress reader it needed is gone again. Kept from it: an older progress format is reported as "converted"
  only when reading it dropped or corrected a stored field (`keptAsItWas`, utils/progress-record.ts) – for the
  next real format change (Tilman: no notice when nothing changed).
- S22 check of the 8th Wall-only build: 11 automatic switches across pages 1–27 in 90 s, ready in 0–3 ms, photo spreads found.
- iPhone test belongs to Phase 14 "Content and refinement" (Amsterdam, with Kévin Bray – Tilman).
- [x] Staging: the Netlify site may still set `VITE_AR_TRACKER` – obsolete, Netlify is shut down (#10).

## 2026-09-28 – Demo spreads from the layout PDF for the tracker load test (Tilman)

- `OSCT_KevinBray_06.pdf` (11 pages: page 1 single, 2–11 A3 = two book pages each; printed page numbers
  1, 2|3 … 20|21) → **spread4–spread14**, app pages continue at 7 (Tilman): PDF page 1 = page 7 (single),
  PDF page n = pages 2n+4 / 2n+5 … PDF 11 = 26–27. Titles "Demo 8–9" etc.
- Per PDF page the up to **5 largest printed images** (RULES #3) → 29 glossary entries `demo-p<page>-<n>`
  ("Demo p. 8 · 1"), target only, no AR content. Rendered from the page at their printed position (overlaps and
  gold frames as the camera sees them), ≥ native resolution, ≤ 2048 px. Pages 8–11 (PDF): one full-spread
  photo each. Book total now 14 spreads / 39 targets. Some targets are tiny (e.g. `demo-p07-2`, 154×93).
- `.mind` files compiled with the vendored MindAR `Compiler` in a GPU Edge window over CDP (one-off script,
  1–24 s per spread; headless = software GL was far too slow). `develop` has `npm run compile:mind` for this
  (1.2.0) – this branch is older (1.1.1); on a merge the `.mind` location differs (`.mindar/` there).
- Debug overlay (8th Wall): **"Spreads loaded ahead"** ±0 / ±1 (default) / ±2 / all (`osct-ar-prepared-spreads`,
  applies at the next spread switch) – the knob for the load test.
- Tilman (2026-09-28): 8th Wall tracks with visibly less jitter than MindAR, and more loaded targets have not
  added jitter so far. MindAR stays supported (default) for now.
- Removed 4 demo targets that were the same images as original targets (Tilman): `demo-p14-1` = `shadows`,
  `demo-p14-2` = `sleeping-dragon`, `demo-p14-3` = `sploosh-the-sheep`, `demo-p19-1` = `edge` (image
  correlation ≥ 0.997; everything else ≤ 0.73). Book now 35 targets; spread8/spread10 `.mind` recompiled.
- S22 session 1 (±1): page-by-page auto switch 4→10 worked, next spread ready in 0–2 ms; jumping back to 1–2
  could not switch (only neighbours loaded). The four full-spread photo targets (pages 20–27) were never found.
- S22 session 2 ("all", 39 targets): all extracted ~3 s after start; far jumps switch by themselves
  (5–6 → 18–19 → 1–2 → 3–4 → 7 → 11 → 14–15), next spread ready in 1–5 ms, the target that caused the switch
  found 34–71 ms later. No visible slowdown or extra jitter with all targets loaded (Tilman) – not yet measured
  side by side. Small targets are found late or flicker (e.g. 6.4 s for a second target on 1–2).
- "No 3D / video" during the tests = the USB tunnel had dropped (adb forgets `reverse` when the phone
  reconnects): assets of a newly opened spread could not load. A loop re-applies the tunnels every 2 s;
  models and video confirmed working afterwards (Tilman).
- [x] Full-spread photo targets (spread11–14): found in Tilman's later test (2026-09-28) – the first sessions
  had them on the wrong side of a dropped tunnel / not in view long enough.
- [ ] Load test numbers with "all" vs ±1: time to first find, frame rate.

## 2026-09-28 – 8th Wall spread switches: neighbours kept loaded (Tilman: "save switch times")

- Measured on the S22: the engine's own feature extraction is fast (~0.6–0.75 s for 4 targets); the slow part
  was ours – `canvas.toBlob()` waits for idle time, which the engine's frame loop hardly leaves (~4.2 s per image
  while tracking). Now `toDataURL()` (synchronous, ~12 ms) → blob URL: 150–260 ms per image.
- The engine keeps targets it already has when configured again and extracts only new ones (one per frame; a new
  configure restarts that queue). So `IImageTracker.prepareTargets(spreads)` (called by `ArScene` when a spread
  is ready, with `getNeighbourSpreads()` – the same ±1 as `PreloaderService.preloadNeighbours`) keeps the
  neighbours' targets loaded next to the current ones; the app reacts only to the current spread's. The empty
  configure on every switch is gone. MindAR: no-op (its `.mind` files are preloaded into the browser cache).
- Result (S22): first spread ~1.15 s (was ~5 s); switch to a neighbour 0–1 ms; to a non-neighbour ~0.6 s.
- [ ] Measure the cost of more loaded targets (≤ 15 with ±1 and 5 per spread): time to first find and frame
  rate on the current spread, compared with only its own targets loaded.
- [x] Automatic spread switch (Tilman: "try the automatic switcher"; the spread menu stays): a neighbour's target
  held in view 400 ms while none of the current spread's is found → tracker `onSpreadSeen` → scene event
  `spreadSeen` → bridge `switchSpread()` in scan mode (same path as the menu). Reported again every 400 ms while
  held. S22: switched 1→2→1→2→3→2→1 by turning pages, each ~0.4 s after the page came into view, targets
  ready in 1–4 ms. `LazyArScene` now forwards every `ArSceneEvents` key (a fixed list had dropped the new event).
- [ ] How many targets the engine can keep loaded is unknown (Tilman) – find out in this phase; the neighbour
  range (±1) is the knob (debug bar setting, then a load test).

## 2026-09-28 – S22 test of the 8th Wall tracker: whole images instead of the 3:4 crop

- Phone test over USB (`adb reverse tcp:5174`, http dev server; the phone was on mobile data, so the LAN URL
  timed out). A leftover tab holding the camera caused "camera is not responding" – closing it fixed it.
- 8th Wall on the S22: camera picture under the three.js canvas ok (upright, full screen), `edge`, `racoon`,
  `ancient-tree` found and placed like MindAR, ~34 fps (page rAF). The engine floods the console with WebGL
  "READ-usage buffer" performance warnings (its own GPU readback).
- `shadows` (254×650) was never found: the centred 3:4 crop kept only the dark, repeating middle sections.
  Now the **whole image** is fitted into the 3:4 frame and the rest filled with its edge colour
  (`targetFrame()` in `ar/xr8.ts`); anchors scaled by image width ÷ frame width. After the change `shadows` is
  found often (Tilman). The padding is only in the target data – nothing changes in print.
- Branch has no `docs/CHANGELOG.md` / version bump rule yet (added on `main` in 1.1.2) – no bump here.

## 2026-09-28 – 8th Wall tracker built side by side with MindAR (Tilman: "build a working version")

- `ar/tracker-8thwall.ts` (+ `ar/xr8.ts`) implements `IImageTracker` (`ar/tracker-types.ts`) like the MindAR
  `ImageTracker`; `ar/create-tracker.ts` picks one (each engine its own chunk). Choice: build flag
  `VITE_AR_TRACKER=mindar|8thwall` (default MindAR), overridden per device in the debug bar ("Use 8th Wall
  (reload)", localStorage `osct-ar-tracker`); the collapsed debug line starts with `MA` / `8W`.
- Engine files (`@8thwall/engine` 0.1.0, MIT, 1.57 MB gz) served as-is from `assets/xr8/` (vite plugin
  `xr8Engine`), not precached. Targets are made at runtime from each target's `imageSrc` (the image-target
  CLI's default crop: centred 3:4, landscape turned, grey 480×640) – no content build change for the test.
- Anchors keep the MindAR convention (1 unit = image width, origin centre); verified headless (fake camera, both
  engines on the same clip: same apparent size and orientation), spread switch keeps the camera, prod build ok.
- [ ] Phone comparison S22 + iPhone (staging with the debug bar): time to first find, jitter, lag, angles, frame
  rate, heat, first-scan load time. Also check: iOS motion permission prompt, pause/resume, camera orientation.
- Known limits of the 8th Wall path: the engine tracks max. 4 targets at once (`maxTrack` is MindAR's); its camera canvas is a second WebGL
  context (as MindAR's TF.js).

## 2026-09-28 – Exploration "webworker tracking" (Tilman; branch `claude/laughing-wright-hrt8zy`)

- Research only: `agents/research/webworker-tracking.md`. A worker makes the app smoother, not the tracking
  more precise; MindAR tracks on a 128-px template with 10–41 points, and our target images are 146–462 px.
  8th Wall's engine (Image Targets, C++/WASM) is MIT open source now → spike it instead of rebuilding.
- [ ] Final target images ≥ 1000 px, textured (with the artist) – helps any tracker.
- [x] Spike 8th Wall side by side with MindAR – Tilman: yes, built (entry above). Switching for good would change
  the RULES stack line "Image tracking: MindAR" and the `.mind` content build – after the phone comparison.

## 2026-09-28 – Workspace tidy-up, version 1.2.0 (Tilman, branch `compilation`)

- **Version 1.2.0** (RULES #10, #23): one bump for the whole branch, 1.1.4 → 1.2.0 after merging
  develop; MINOR – new features (`.mind` compiling, Info page credit), nothing incompatible; CHANGELOG
  section added. (An earlier 1.1.1 → 1.2.0 bump in `6c49057` was superseded by the merge.)
- **`.mindar/`** in the root holds everything local about `.mind` files (not in git): `targets/` (was
  `mind-ar/`), `history/` (was `mind-history/`), `cache/`, `browser/`, `benchmark.json` (were in
  `scripts/.cache/`). `lib/local-folders.ts` moves the old folders on the first content build.
  [x] Remove `moveOldLocalFolders()` once Tilman's working copy has built once – gone.
- `.gitignore` rewritten (grouped, stale rules gone); `client/.env` is an explicit exception (comments only,
  documents the `VITE_*` flags); `scripts/.gitignore` removed (the root one covers it). Checked: nothing
  tracked is ignored, nothing untracked is missing. By design, not wrong: the content media exist twice
  (`content/` + the optimised copy in `client/public/assets/content/`) until the content leaves the repo.
- `compile:mind --force` = all spreads with the cache (as the docs said); `--fresh` = from scratch.

## 2026-09-28 – `scripts/` restructured + tests (Tilman, branch `compilation`)

- `src/index.ts` (entry) · `src/build/` one file per part (book, spreads, entities, entries, targets,
  tutorial, game-config) · `src/lib/` helpers (errors, content, files, hash, schema, validation,
  optimize-media; was `src/utils/`) · `tools/mind/` (compile, history, versions) · `tools/sounds/` ·
  `tools/lib/cli.js`. Tools are `.js` (package is `"type": "module"`, `.mjs` was redundant).
  Verified output-neutral: `game.config.json` (without version) and all public files identical.
- Tests: vitest in `scripts/test/` (not `src/` – `src/` is part of the content hash), `npm test`, in CI.
  Throwaway content in temp folders via `OSCT_CONTENT_DIR` / `OSCT_MINDAR_DIR` (also for content
  outside this repo later). Covers build rules, ordering, fingerprints, tutorial, hash, cli, versions,
  and the real content.
- compile:mind output step by step (Tilman: "nachvollziehbar"): 1 target images (per spread: compile or
  skip, and why) · 2 browser + graphics card · 3 compile (live line per job: image, phase GPU/CPU, %,
  time; overall % + MP/s + time left) · 4 write · 5 summary · 6 content build. `--fresh` without spread
  names = all spreads (before: nothing when all were up to date – Tilman's first RTX run did nothing).
  `npm run mind:benchmark`: jobs 1, 2, 4 … on all images, table + fastest → `.cache/mind-benchmark.json`,
  which compile:mind uses as its default `--jobs` on the same graphics card. Code: `src/tools/mind/lib/`
  (paths, console, targets, browser, run, stats).
- Tilman's benchmark (RTX 2070 SUPER, D3D11, Chrome 154, 12 cores, 10 images / 4.6 MP): jobs 1 35.7s (cold),
  2 7.1s, 4 6.1s ★, 6 6.2s, 8 7.1s → ~1 min per 100 targets at this size. Run 1 was slow from the browser's
  one-time GPU setup (images-060 7.8s alone vs 3.0s in run 2) → benchmark now does an untimed warm-up
  first. Default stays automatic (benchmark file / half the cores, max 4 = 4 there) – no --jobs in
  package.json. [~] Keep Chrome's GPU cache between runs: persistent profile per browser in
  `scripts/.cache/mind-browser/<browser>/` (`launchPersistentContext`); jobs on their own sites
  (`mind-<n>.local`) for separate renderer processes. Container (SwiftShader): only ~6 % (no real shader
  compile there). [x] Tilman's RTX 2070 SUPER, `compile:mind --fresh`, 10 images: 26.0 s (cache
  empty) → 4.9 s → 4.7 s (~0.5 s/image, ~47 s per 100 targets). Runs 2 and 3 byte-identical; spread2 from
  the RTX = the online tool's file of 2026-09-24 byte for byte (version …83c85caa); spread1/3 differ in
  float noise (other GPU).
- All TypeScript (Tilman: "maybe all in typescript makes more sense? why two libs?"): the tools were JS
  only to run without a build – compile:mind builds first anyway. One `src/lib/` (cli, console joined
  it), `src/mind/` (compile, benchmark, history, versions, browser, run, targets, stats), `src/sounds.ts`;
  paths in `config.ts`. Vite bundles one file per command (`dist/index.js`, `mind-compile.js`,
  `mind-benchmark.js`, `mind-history.js`, `sounds.js`), ES only (the unused `.cjs` output is gone).
  The content hash skips the command files (`hash.ts` COMMAND_FILES). Verified: same .mind bytes.
- Build docs cut down to a quick start + command/option/folder tables (Tilman: "for dummies").

## 2026-09-28 – Tutorial steps belong to the app, not the content (Tilman)

- [ ] Refactor (Tilman): the onboarding/tutorial steps (`content/steps/<id>/step.yaml` → `tutorial` in
      `game.config.json`) are app UI, not book content – keeping them in `content/` overloads what content
      is. Move them into the app (e.g. `client/src/` data + i18n keys for the texts, illustrations in
      `client/public/assets/illustrations/`). Touches: `buildTutorial()` in `scripts/src/index.ts`,
      `StepData` + guards in `shared/`, `getTutorial()` in `client/src/utils/game-config.ts`,
      `components/tutorial/*`, `LinkService`, content tests, `docs/content.md` ("Onboarding screens").
      Keep the `{{title}}`/`{{author}}`/`{{publisher}}` placeholders (filled from `book.yaml`).
      Not started – Tilman's refactor.

## 2026-09-28 – `.mind` compilation in the content builder (Tilman, branch `compilation`; PLAN Phase 12)

- Goal (Tilman): compile the `.mind` files from the content build instead of MindAR's online tool. Must
  use WebGL (fast, same code path as the online tool) → a **manual, local step**, not in CI/deploys
  (Tilman: "otherwise my deploy script will take forever").
- Research, MindAR 1.2.5 source (`src/image-target/`): `Compiler` (browser: canvas + TF.js WebGL, tracking
  features in an inlined worker) and `OfflineCompiler` (Node: `canvas` package + TF.js pure-JS CPU kernels).
  Both share `CompilerBase`; format v2 = msgpack `{ v, dataList[{ targetImage{w,h}, trackingData, matchingData }] }`.
  - Node path works without `canvas` (subclass `CompilerBase`, decode with jpeg-js/pngjs, fake 2D context),
    deterministic, but **57 s** for spread3 (one 2059×1796 image) vs 17.5 s in software WebGL, and ~4 %
    of feature points differ from the online tool. npm `mind-ar` also drags in canvas, mediapipe, three,
    a vite-5 plugin, 270 MB of TF.js. → rejected.
  - Browser path (chosen): `playwright-core` drives an installed Chrome/Edge, page loads the vendored
    `mindar-image.prod.js` (self-contained, exports `Compiler`) from disk via `page.route`. Recompiling
    spread2 + spread3 reproduced the committed files' feature points and tracking data exactly (bytes
    differ only in float noise); spread1 target 0 (`images-000.jpg`, Shadows) differs by a few points –
    probably compiled from an earlier export of that image. Compile time grows with image resolution.
  - `playwright-core` is a scripts devDependency: no browser download in `npm ci`; the tool falls back to
    Playwright's Chromium only if installed.
- The content build fails on a stale fingerprint → CI catches a forgotten recompile; the committed `.mind`
  files stay the source of truth for Netlify and the staging deploy (they only run `vite build`).
- Speed (2026-09-28, Tilman: final book has 100s of targets, compiles on an RTX 2070):
  - MindAR compiles every image independently (`hierarchical-clustering` seeds a new randomizer per
    call) → the tool compiles one image at a time and merges with `importData`/`exportData`. Verified:
    **byte-identical** to compiling a spread in one batch (all 3 spreads). Enables the per-image cache
    (`scripts/.cache/mind/<image sha256>-<vendored MindAR hash>.mind`) and parallel jobs (one browser
    context per job = own renderer process + MindAR worker).
  - Vendored TF.js creates its WebGL context without `powerPreference` → an init script injects
    `high-performance`, plus Chrome's `--force_high_performance_gpu` (`--gpu default` turns both off).
  - SwiftShader (container, 4 cores, 2 jobs): 10 images / 4.6 MP in 34 s, detection (GPU) 92 % of the time,
    tracking (CPU worker) 7 %; ~3–5 s fixed cost per image (TF.js shader compiles per keyframe size –
    MindAR's own TODO "reuse the same detector"). Real GPU numbers: Tilman's benchmark.
- Versions (2026-09-28, Tilman: "test locally before deploy or commit … rewind"; git won't be an option
  once the content leaves the repo): `scripts/tools/lib/mind-history.mjs` – every compile stores the new
  `.mind` and the one it replaces in `mind-history/` (gitignored, next to `mind-ar/`), same bytes once,
  newest 20 per spread + the current one. Restore refuses versions made from other target images
  (would be "stale"). Test on the dev server (service worker off there).
  - [x] Open: when the content moves out of the repository, move `mind-history/` (and `mind-ar/`) next (obsolete: MindAR removed in 1.3.0)
        to it – both tools resolve the paths from the repo root today.
- Attribution (2026-09-28, Tilman): compile tool = MindAR's own `Compiler` from the vendored build (no
  compiler code of ours; the Node CPU port from the research was never committed). MindAR's MIT `LICENSE`
  added to `client/src/vendor/mind-ar/`; Info page colophon ends with "Image tracking by HiuKim (MindAR)
  github.com/hiukim/mind-ar-js" (lead-in translated, names not).
- Docs (Tilman): one file – `docs/content-build.md` merged into `docs/content.md` (section "Content build",
  with "Compiling .mind files"); links updated.
- `.mind.sha256` files are not copied to `client/public/assets/content`.
- [ ] Open: target images much larger than the printed size (e.g. `edge/images-060.jpg`, 2059×1796)
      make the `.mind` and the compile bigger/slower – downscale in the build (e.g. max 1000 px)? Needs a
      tracking test on the book first.

## 2026-09-28 – Camera denied screen and settings spacing (Tilman, 1.2.3)

- Camera denied screen: no browser-specific steps any more ("too much information"; the user-agent guess
  showed Firefox steps in Chrome). One generic hint + "Reload page"; `detectBrowser` removed. In scan mode the
  overlay keeps clear of the header counter (`--consultation-top`) and the spread menu (bottom padding).
- Info page: the first switch's text sits 2rem below the "Settings" title (was 1rem) – like the gap
  between switch rows.

## 2026-09-28 – Releases deploy production (Tilman)

- Production is deployed by publishing a GitHub release (`release.yml`), not by merging to `main`. The
  workflow verifies tag = version (client, scripts, Version.php), a CHANGELOG section and that the commit
  is on `main`; empty release notes get the CHANGELOG section.
- Tags come from `tag-version.yml` on every push to `main` (repository token): cloud agent sessions get
  HTTP 403 on tag pushes. It tags every CHANGELOG version that has no tag yet, on the last `main` commit
  carrying it (so v1.1.2 and v1.1.3 were tagged retroactively). Bot-made tags start no workflows.
- Netlify cannot trigger on tags/releases itself → its automatic builds are stopped (Netlify UI) and the
  release workflow uploads the tagged build with the Netlify CLI.
- [x] Tilman: GitHub environment `production` with `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `VITE_API_URL`; (obsolete: Kamal deploys, #6/#10)
  Netlify site `osct` → Stop builds. Production server settings (`FTP_*`, `DB_*`, …) once the client's
  server exists – until then that job is skipped with a warning.

## 2026-09-28 – Code comments rewritten (Tilman)

- Comments across client, server and scripts now describe responsibility and business rules only: no
  names, dates, design page/frame numbers, PLAN phases or history. CSS comments only where a rule would
  otherwise be "fixed" wrongly. Measured values and decisions live here, in DESIGN.md and RULES.md
  (new DESIGN.md §3 "Details" table holds the values that were only in comments).
- Kept as code facts: the account section is *removed*, not hidden, without an accounts API (a hidden
  section would still draw its neighbour's rule); "Download all content" is removed where downloads do not
  persist (`InstallService.keepsDownloads`, e.g. iOS Safari tabs), and its progress counts files already
  cached while browsing.
- Unlock semantics as implemented: finding a target in scan mode unlocks it (`TARGET_UNLOCKED_EVENT`);
  opening its entry marks it consulted. The 2026-09-26 note "a tap on the entity now unlocks it" is outdated.
- Open: `pages/error-page.ts` unsubscribes with a fresh `.bind(this)`, so its store subscription is never
  removed.

## 2026-09-28 – Shorter translation calls (Tilman)

- UI texts use i18next's named `t` export: `import { t } from "i18next"` and `t("about:info")` instead of
  `i18next.t(...)`. It is bound to the default instance (initialised by `src/i18n`), and i18next-cli still
  extracts bare `t(...)` calls (locale JSON unchanged). Files that also need `resolvedLanguage` /
  `changeLanguage` import both: `import i18next, { t } from "i18next"`. RULES #20 updated.

## 2026-09-27 – Branch cleanup and dependency audit (Tilman)

- Only `main` and `develop` remain; all experiment branches deleted locally and on GitHub (Tilman).
  Unmerged tips, restorable while git keeps them: `clickable-target` 5049355, `content-iteration` e556d9f,
  `svelte-and-threejs-rewrite` 3d51451 (local only).
- Dependabot showed 48 alerts, all npm dev tooling in `client/` and `scripts/` (nothing in the shipped
  runtime deps or `server/`). `npm audit fix` (no majors) in both: `scripts/` is at 0.
- [x] `client/` upgraded (npm audit: 0): vite 5 → 8 (Rolldown), vitest 1 → 5, @vitest/coverage-v8 5,
  happy-dom 13 → 20, @vitejs/plugin-basic-ssl 2; `vite-tsconfig-paths` replaced by Vite's
  `resolve.tsconfigPaths`. Node ≥ 22.12. Rolldown drops `@license` comments by default –
  `output.comments.legal` keeps TF.js's notices as before. happy-dom 20 has no `window.confirm` (test setup
  stubs it); tsconfig lists `node` types (Vite 5 pulled them in implicitly). Verified: tests, tsc, build,
  and MindAR on the WebGL backend in the built app (4 targets loaded, detection, tracking, worker match).
- [x] `client/src/assets/` (`.deprecated`, `cross.svg`, `ghost-icon.svg`, `index-icon.svg`) removed as
  legacy (Tilman); nothing referenced it – all app assets live in `client/public/assets/`.

## 2026-09-27 – Accounts by email (Tilman, branch `database`; PLAN Phase 11)

- Merged into `develop` and `main` (1.1.1); the branch `database` is deleted (Tilman). The API deploy to
  osct.porschuetz.de (`deploy-staging.yml`, GitHub environment `staging`) runs on every push to `develop`.
- Workflows (Tilman 2026-09-27): **Checks** (`checks.yml`, was "CI": tests, deploys nothing) and **Deploy staging server
  (osct.porschuetz.de)** (`deploy-staging.yml`): the whole site, app + API. osct.porschuetz.de is the staging server;
  the Netlify sites are temporary (they call its API) and are dropped once the client provides the final server –
  production then gets its own workflow and GitHub environment `production`.

- Goal: let readers hear about updates – very basic first. Signed out (Tilman): "Register your copy and
  receive updates in your inbox" – email, **Register account**, and underneath three update switches, **off
  until the reader turns them on** (opt-in – "very important"): updates on Onion Skin & Crocodile Tears ·
  from Kévin Bray (the book's author) · from Building Fictions. The progress is **always saved** in the
  account and can be reset ("save my progress" is no longer an option). An existing user keeps their options
  when signing in again; signed in, the switches change them at once.
- **PHP + MySQL** (Tilman), plain PHP like qr.scutoons.com (no framework/Composer). There was no identity
  server in scutoons / qr.scutoons.com to reuse – only the style (PDO, config.local.php, FTP deploy).
- Confirmation = **link + 6-digit code** (Tilman): on iOS a mail link opens Safari, not the home-screen app.
- Mail: `mail()` for testing, SMTP for production (settings in config/env, Tilman).
- Progress = **sync to the server** (Tilman). The device record stays the working copy; the
  server version (`updatedAt`) guards against two devices overwriting each other. An existing account
  keeps its options when signing in again (the form's choice applies to a new account only).
- API on the **OSCT production host** under `/api` (Tilman); first on the development server
  osct.porschuetz.de (all-inkl, PHP 8.5, MySQL). FTP host `dd38836.kasserver.com` (the certificate is for it).
  Credentials only in `server/.env` (not committed) and GitHub environment `staging`.
- Naming (Tilman): **user** in code, API (`/user`) and database (`users`, `user_id`); "Account" only as the UI
  label (Info → Account, i18n namespace `account`, `<settings-account>`).
- Info page regrouped (Tilman): Info · **Account** (sign-in, update switches, sign out / delete, **Reset progress** (above the sign-in)
  – signed in it resets the account's copy too) · **Settings** (sound & vibration, language, home screen) ·
  colophon. The **Tutorial section was removed** from the Info page at Tilman's request (the onboarding stays).
- Options are phone-style switches: `<gold-switch>` (components/buttons, own element – Tilman), text left,
  switch on the far right; design primitive `.switch` / `.switch-row`. Sounds / vibration use them too.

## 2026-09-26 – PWA (Tilman: "do the PWA now"; PLAN Phase 9b)

- Why: repeat starts from the phone's storage (app shell + seen content), offline use, install to the home
  screen. First visit is not faster; AR speed (tracking, frame rate) is unchanged. A native wrapper
  (Capacitor) would only add store presence – same WebKit on iOS, same performance; not planned.
- vite-plugin-pwa with **injectManifest** (own worker `client/sw/service-worker.ts`, not generateSW) for:
  - **Pages network-first** (4 s timeout, offline → precached `index.html`): online a deploy shows at once,
    no stale shell, no "update available" UI needed. The worker takes over at once (`skipWaiting` +
    `clientsClaim`) without reloading the page – a running session keeps its code.
  - **Content cache per content build** (`osct-content-<version.hash>`, hash baked in via
    `__VITE_CONTENT_HASH__`): content URLs are not hashed, so a new content build must drop the old cache
    (done on activate). Right after a deploy the old worker may serve old content for the first launch
    until the new one activates (seconds) – accepted.
  - Only 200 responses are cached (the preloader's full fetches); a `<video>`'s first range request (206)
    goes to the network, later ones are cut from the cached file (`RangeRequestsPlugin`).
- Default chosen (Tilman did not pick yet): **cache what is used**, no full download of all content (24 MB+).
- Registered in production builds only (dev server stays uncached). Testing locally: launch config
  `client-preview` (production preview, plain http on localhost:4174 after `npx vite build`). The in-app
  browser pane has no service workers (not a secure context) – test with a real Chrome/Edge.
- iOS: no install prompt (Share → Add to Home Screen); the installed app has **its own storage** – progress
  from Safari does not carry over; installed apps are exempt from Safari's 7-day storage deletion.
- 2026-09-27 (Tilman): home-screen name = book title; "Add to Home Screen" as an Info page section
  (not the onboarding, for now); the **final app downloads the whole content** (when: open – PLAN 9b);
  production FTP host: note only, handle when production is set up (PLAN 9b lists what it needs).
  Chrome's own install banner stays on too (no `preventDefault` on `beforeinstallprompt`) – Tilman did not
  see an install offer while it was suppressed.
- Beware: `npm run i18n` (i18next-cli extract) drops keys that are not used in code yet and blanks new
  translations it adds – write the code first, then fill the JSON files, then run it again.
- Whole-book download (2026-09-27, Tilman): "download as you read" stays the default; Info has "Download
  whole book" with the total size, a progress bar ("x of y MB") and the size when done – for testing how
  long it takes. No "clear" button (uninstalling removes it). File sizes come from the build (a Vite
  virtual module over `public/assets/content`), not from the game configuration – no content-build change.
- [ ] Final app icon; whether the whole download should start by itself later – Tilman.

## 2026-09-26 – Unlock animation: reverse emissive dissolve (Tilman, branch `unlock-experience`)

- Chosen from the options (Three.js Journey fireworks / hologram / particles, Codrops dissolve, gommage):
  the **Codrops emissive dissolve played in reverse** (github.com/JatinChopra/emissive-dissolve-effect, MIT)
  – for models, video and image planes alike. `ar/celebration.ts`: noise × amplitude vs. progress
  (positive → negative), edge wide → narrow, HDR gold edge + gold glow band, sparks from the surface;
  `DISSOLVE` holds all parameters. Bloom (`UnrealBloomPass`, only during the animation, half resolution)
  is added over the camera image as light (`ar/view.ts`). Colours from the gold palette (Tilman).
- Phone test (Tilman): bloom a bit too bright, a bit too fast → bloom 1.0, edge ×1.3, unlock 4.2 s.
  Three kinds (`ANIMATIONS` in celebration.ts): **unlock** (first find) with gold, sparks and bloom;
  **reveal** (every later find) the plain dissolve (1 s, no colour, no bloom); **outro** (target lost) the
  reveal rewound (0.7 s) at the last position, then the anchor hides.
- Sounds: the calm second take was reverted – Tilman prefers the chiptune placeholders (for now).
- [x] Tune further on the phone – Tilman: shorter in 1.9.6 (#57, see 2026-10-28).

## 2026-09-26 – Stuck spinner on the S22 = Chrome's camera, not the app

- Staging hung at "starting": Chrome had the back camera open (`adb shell dumpsys media.camera`), the
  stream was "live" 640×480 but delivered no frames – also to a bare getUserMedia test without the app.
  Firefox had used the camera shortly before. Fixed by restarting Chrome (`am force-stop com.android.chrome`).
- [x] Camera start timeout (10 s, `ar/tracker.ts`) → camera overlay state `NOT_RESPONDING`: "reload the
  page, else restart the browser" + Reload button (en/fr/nl/de); cleared when AR runs again.

## 2026-09-26 – Unlock vs. consult (Tilman – simple version; designers / artist decide the direction)

- **Unlock = finding a target the first time** ("oh, there you got it"): label + animation (image: rotation
  in the found indicator; AR entity: discovery animation in WebGL) + unlock jingle.
- **Consulted = the entry was opened**: a tap on the found image or on the AR entity opens the entry.
- **Reveal = every later find**: the `found` signal (sound "pew pew pew" + short vibration, once per target
  every 4 s). One sound per moment, no separate reveal event.
- Nothing sticks in space – that belongs to Phase 10 (spatialisation). The "stuck" objects were anchors
  that stayed visible after a pause (MindAR restarts its tracking state on resume); a pause now loses all.

## 2026-09-26 – Tap / pin concept (open – Tilman works it out first; PLAN Phase 10)

- Tested on the S22: placement and tap to unlock work, animations are a good starting point. After a tap the
  object seems to "stay in space": the entry opens → the scene pauses → the last frame (camera + model)
  stays frozen behind the consultation page until scan mode resumes.
- Questions for the concept: should a tap open the entry at once (today, after 1.2 s) or only unlock it
  (animation, "New entry unlocked" becomes an "Open entry" button, the object stays live in AR)? Which
  gesture pins (long press?), how does a pin end (tap, page found again, leaving scan), several pins?
  Should the frozen frame behind an entry show the object or only the page?
- Floor tracking / spatial experience: Phase 10, later.

## 2026-09-26 – Placement, tap to unlock, pinning research (Tilman, staging test)

- Models stood upright facing the top of the page. Now `entity.params` `position` / `rotation` / `scale`
  (degrees; x tips up, y turns around the model's own vertical axis, z tilts); models default to standing
  on the page (`[90, 0, 0]`), videos / images lie flat. Axes: x right, y top of the page, z out of the page.
- Entities could not be unlocked (the found indicator only served targets without an entity). A tap on
  the entity now unlocks it: WebGL discovery animation + the indicator's label + `reveal` sound, then
  the entry. The canvas lies under the pages, so `ArScene` reads taps from the document (UI ignored).
- **Pinning** (keep an object in space after tracking is lost) – research:
  - MindAR only knows the target's pose relative to the camera (camera fixed at the origin). Once the
    page is lost, nothing tells how the phone moves – image tracking alone cannot keep an object in space.
  - 3DoF with the gyroscope (DeviceOrientation / AbsoluteOrientationSensor): at the pin, remember the
    object's pose and the phone's orientation; afterwards counter-rotate the object by the phone's rotation.
    The object stays put while the phone turns, not while it moves sideways; drifts slowly. iOS asks for
    motion permission (needs a tap – the long press is one). Works with MindAR as it is. **Recommended.**
  - 6DoF with WebXR `immersive-ar` (hit test, anchors): real world placement, but Android Chrome only (no
    iOS Safari), and the WebXR session takes over the camera – MindAR's tracking stops while pinned.
  - Commercial web SDKs with world tracking (e.g. Zappar) – licensed, a different tracking engine.
  - Open for Tilman: gesture (long press ~0.6 s with a progress ring?), how to unpin (tap, next find,
    leaving scan), several pins at once?

## 2026-09-26 – Performance: three.js instead of A-Frame, static splash (Tilman, branch `performance`)

- Lighthouse (mobile) before: performance 56, FCP 6.0 s, LCP 17.2 s – three render-blocking scripts
  (A-Frame, aframe-extras, MindAR), A-Frame boot, and the AR scene built at startup (the loading screen
  waited for spread 1's models). PWA later.
- A-Frame removed: plain three.js + MindAR's `Controller` (vendored 1.2.5 in `client/src/vendor/mind-ar/`;
  the `mindar-image-three` build imports `sRGBEncoding`, gone since three r162). `ar/tracker.ts` is a port
  of MindAR's `MindARThree` – no MindAR internals any more. Folder `aframe-bridges/` → `ar-bridges/`.
- AR is lazy: its chunks load on the first scan (warm-up in idle time after startup); first paint needs
  only `main.js` (66 KB gz) + CSS. The static splash (first onboarding step) is in `index.html`, written at
  build time; the app fades it out and continues with the next step.
- Tested on the S22 (dev server via `adb reverse tcp:5174 tcp:5174` – localhost counts as secure, the
  camera works over http): all demo targets displayed and played, spread switches keep the camera.
- Models are optimised automatically by the content build (`scripts/src/utils/optimize-models.ts`):
  textures ≤ 1024 px (JPEG when opaque), meshopt geometry; `content/` stays as authored. Pure JS/WASM on
  purpose (CI compares the output; no native sharp). `@gltf-transform/functions` still installs sharp
  indirectly (prebuilt, in the lockfile for Linux + Windows) – never call it.
- [ ] Open: iPhone test (Safari video textures, camera), Lighthouse on the deploy preview.

## 2026-09-26 – One AR scene (Tilman, after the device tests)

- Only the persistent scene stays (spread switches "pretty flawless" on the S22). Removed: the rebuild
  strategy (`ArScene` per spread), the switch in `ar/index.ts` (`AR_SCENE_STRATEGY`, localStorage
  `osct-ar-strategy`, `VITE_AR_STRATEGY`), `client/.env.ar-*`, scripts `build:ar-*` / `dev:ar-persistent`,
  the strategy test, the strategy mark in the debug bar and the switch timing log. `BaseArScene` +
  `PersistentArScene` merged into one `ArScene` (`ar/ar-scene.ts`); comments without phase references.
- Deploy 2026-09-26: `design` fast-forwarded to `main` (6228f67). CI was red since Phase 6 (unused
  `mind-ar` package → `canvas` has no Node 22 build; Windows-only Rollup in the lockfile) – both fixed.
  osct.netlify.app still served a very old build afterwards – Netlify isn't building `main` (check the
  site's build settings); osct.buildingfictions.com doesn't resolve yet.

## 2026-09-26 – Sounds and haptics (Tilman)

- `FeedbackService`: named events tick (slider notch), tap (buttons/links, one global click listener,
  `data-feedback="none"` silences), found (target found again, 4 s cooldown per target – tracking
  flickers), unlock (first find). Web Audio after the first tap; `navigator.vibrate` on Android; iOS 18+
  via the native switch-toggle trick (only right after a tap, not while scrolling), else nothing.
- Sounds: generated chiptune placeholders (a calm "mindfulness" second take was tried on 2026-09-26 and
  reverted – Tilman liked the chiptune better) (`scripts/tools/generate-sounds.mjs`, "think Nintendo") in
  `client/public/assets/sounds/<event>.wav` – Tilman replaces them with designed sounds of the same names.
- Info → Settings → "Sound & vibration" (settings-feedback), on/off each, kept in localStorage
  `osct-feedback` (device setting, not progress – survives "Reset progress").
- [ ] Open: test on an iPhone (iOS 18 haptic trick, silent switch mutes web audio).

## 2026-09-26 – Video filters (Tilman, tested on the phone)

- Data model: `entity.filters: [{ type, ...parameters }]` on video entities, applied in order (replaces
  `params.chromaKey`, no compatibility). Each filter type is defined once in `shared/types/filters.ts`
  (kind, default, range, description per parameter): the client builds the shader uniforms from it, the
  content build and the config guard check the YAML against it (errors name file, filter, parameter).
- `chromaKey`: color, mode (auto | chroma | luma), threshold, softness, spill, opacity. Chroma can't key
  black (black/grey/white have the same chroma) – `auto` compares brightness for neutral key colors
  (luma defaults threshold 0.06 / softness 0.1). Edge (spread3) uses a black key, all parameters written
  out as an example; docs/content.md has the table for the artists.
- Fixed: the keyed video's texture sometimes stayed empty (`src: #id` resolved to nothing on init –
  sound, but a transparent plane); the entity now hands the video element to the material when missing.
- Fixed: video planes were always 16:9; the height now follows the video's proportions.
- [ ] Open: only one filter type exists; several filters of different types would need a shader chain.

## 2026-09-26 – No 3D content visible on the phone (fixed, found by remote debugging the phone)

- Cause: `#scene { opacity: 0 }` in main.css was only lifted by `#scene.active`; the old SceneService set that
  class, the Phase 6 AR bridge doesn't. Since Phase 6 every model/video was rendered but invisible (found
  via the phone: tracking stable, WebGL pixels brown, `a-scene` opacity 0). Now `body.scene-active #scene`
  (set by ar-bridge while AR runs) shows the layer.
- Phone testing from the PC: USB debugging + adb (`winget install Google.PlatformTools`),
  `adb forward tcp:9444 localabstract:chrome_devtools_remote`, then CDP on the Chrome tab (evaluate,
  console, screenshots incl. WebGL). Headless Edge screenshots don't capture the WebGL canvas.
- The debug bar shows tracked targets and how often each was found (`F[stone-guardian×3]`).
- [x] Open: `SpreadManager.markLoading/markLoaded` are never called – the spread dot in the debug bar is
  always orange. Remove the spread status or wire it to the AR scene? → Removed in 1.4.1 (Tilman 2026-09-28:
  "status initial never changes, redundant"): `GameState.spreads`, `SpreadState`, the mark*/register/isLoaded/
  getLoadingStatus methods, the "C" dot and "Status" line in the debug overlay. `SpreadManager` keeps the current spread.

## 2026-09-26 – Onboarding flow and look (Tilman, mobile test)

- (user) Flash of the "camera denied" screen after granting access: hiding the camera screen re-rendered it,
  and "granted" drew the denied content during the fade-out. Now it fades out with its last content.
- (user) Splash as one flowing sequence: Mark, then title, author, publisher fading in 0.5 s apart (0.8 s each,
  advance 3.8 s). The two splash steps are merged (content: steps renumbered, 4 steps). New step option
  `stagger` (contract, guard, schema). Every step fades in, its parts one after the other (default 250 ms),
  the button last; Mark stays still on later steps. The splash footer sits at 58 % (design p.2).
- (user) The onboarding background looked grey at the sides: measured from the frames and replaced (DESIGN §8.3).
- (user) "Go to start" on the not-found page did nothing: `pointer-events` is inherited as none from the page
  container (every tappable page sets `all`; not-found didn't), and the page bases used `transition: all` – it also
  animated z-index (my "stale z-index" readings were mid-transition) and fading-out pages still caught taps. Now:
  transitions only on opacity/visibility (+ transform), inactive pages `pointer-events: none`, not-found `all`.
- Lesson (browser checks): the pane doesn't render in the background – ResizeObserver / transitions only run after a
  screenshot; take one before measuring layout-dependent things (the spread menu builds on resize).

## 2026-09-26 – Mobile test: camera over https, pill glow, menu line height (Tilman)

- (user) "Grant access" did nothing on the phone: the dev server was plain http on the network address →
  no camera API; and the camera screen sat behind the onboarding page (z-index −1), so its "denied" state
  was invisible. Now: `npm run dev` serves **https** (`@vitejs/plugin-basic-ssl`, self-signed; `dev:http` for
  plain http); new camera state `UNAVAILABLE` ("only works over a secure connection"); during onboarding the
  camera screen is above the page (inline z-index – a toggled `:host([attr])` rule was not re-evaluated) with
  "Continue without camera"; in scan mode it stays behind the chrome.
- (user) Every pill and "i" gets the light bronze glow of the category pill (`--shadow-bronze`).
- (user) Category menu line height 1.5 × the text.

## 2026-09-26 – Start: splash instead of the home page (Tilman, option A)

- (user) The home page (Start / Tutorial) is removed – its buttons were redundant (tutorial in Info, the app
  starts on the last spread). `/` is now `<splash-page>` (`Pages.SPLASH`): it plays the onboarding steps before
  the first step with a button (content: Mark + title, then title/author/publisher fading in), a tap skips
  ahead, then scan mode on the last spread. A first visit still gets the whole onboarding. Leaving the splash
  replaces its history entry (back doesn't replay it). The i18n namespace `home` is gone.
- Splash and onboarding step timers start only after the app has loaded – before, step 0 ran behind the
  startup loading screen.
- The publisher line from 2026-09-26 (home, above Start) went with the home page; the splash shows the
  publisher as the footer of its second step (content).
- (user) `book.yaml` → `publisher` stays: important book information, even while no view shows it – not a
  removal candidate (RULES #15 does not apply to book data).
- (user) The splash footer comes from the field: step texts may use `{{title}}`, `{{author}}`, `{{publisher}}`
  (filled in by `tutorial-content`, checked by the content build); steps 1–3 use them for the book title,
  author and publisher – written once in `book.yaml`.

## 2026-09-26 – Onboarding / home buttons in the flow (Tilman)

- (user) Long texts ran under the tutorial button: it was `position: absolute; top: 58%`. Now the button is
  slotted below the text (`<tutorial-navigation slot="actions">` in `tutorial-content`); the text block has
  `min-height: 58vh − top padding`, so short texts keep the button at 58 % (design) and longer ones push it
  down; the page scrolls if needed. Home had the same problem (seen at 200 % text size) – same fix.
- Lesson: an explicit `min-height` on a flex item in a fixed-height column lets it shrink below its content
  – add `flex-shrink: 0`.

## 2026-09-26 – Publisher on the home page (Tilman)

- (user) "Building Fictions" above "Start" on the home page, same size and style as the title – missing in the
  design draft. Book content: `book.yaml` → `publisher` (optional in the contract, guard and build schema), so
  other books can set their own. [ ] Designers: confirm the position (the buttons moved down by one line).

## 2026-09-26 – No resume prompt, storage notices, links just route (Tilman)

- (user) No resume prompt: the app opens the requested view (link / reload) and keeps going. A plain start
  opens scan mode on the last spread (`lastSpreadId` is applied at startup – agent decision). The link's
  `osct` version is informative only – no "reload to update" (the 2.0.0 test was odd, Tilman).
- (user) Stored progress of another format: reader exists → converted + notice "parts of it may be missing";
  no reader (or corrupt) → reset + notice. `HistoryManager.reportLoadStatus()` replaces `offerResume()`.
- Notices are dismissed with `router.dismissError()` – back to the view underneath (before: always scan mode).
- [x] rem everywhere: root font size `100%` (was 16px – blocked the phone's text size), all px → rem,
  breakpoints in em (RULES #18).
- [x] i18n with **i18next, used directly** (Tilman: "you can directly depend on the library"): `src/i18n/<lang>/
  <domain>.ts`, one namespace per domain, 71 texts in en / fr / nl / de, `{{placeholders}}`, typed keys via
  `CustomTypeOptions`; **informal in all languages** (Tilman). Test checks keys, non-empty, placeholders.
  Translations by the agent – to be proofread by native speakers.
- [x] Info settings, one component per section (`components/settings/`): Tutorial, History (= save game:
  "Reset progress", with a confirm), Language ("Language: English" + "Change language" → the four languages).
- [x] (user) Translations as **JSON** (i18next JSON v4, `src/i18n/locales/<lang>/<ns>.json`) and **i18next-cli**
  (`client/i18next.config.ts`): `npm run i18n` = extract + types (`resources.d.ts` generated, `i18next.d.ts`
  created once), `i18n:status` warns about missing translations without failing; `prebuild` and the
  `build:ar-*` scripts run both, CI shows the status. Empty translations fall back to English
  (`returnEmptyString: false`). i18next-cli stores lists as objects with numbered keys (camera steps →
  `Object.values`). The `.ts` dictionaries are gone.
- [x] Language persistence by **i18next-browser-languagedetector** (`osct-language`; Tilman: the library handles
  it) – the short-lived `SettingsService` was removed. Not in the progress ("Reset progress" keeps it); later
  account settings (API). First visit: device language (the detector then caches it). Changing it reloads the
  app (the URL keeps the view).
- [ ] Open: translate book content (entries, onboarding steps, book info)? Needs per-language fields in the
      content YAML and the build – Tilman / Kévin.

## 2026-09-26 – Links: app state as plain URLs (Tilman)

- (user) Spec: `https://osct.buildingfictions.com/entry/<id>?osct=1.1.0`, `/spread/<id>`, `/entries/category/video`;
  the content hash is not needed in links; incoming links only route; missing id → not-found with a button to
  the start; version off → the corresponding action only if needed.
- Built: `services/LinkService.ts` (pure `parseLink` / `pathForRoute` / `linkForState` / `resolveLink` /
  `isNewerVersion` + the `LinkService` singleton: `openIncomingLink`, `startSync`). Written form
  `/entries/<category>` (the long form `/entries/category/<category>` is read too). Views push a history entry,
  spread switches and tutorial steps replace it; overlays keep the URL; back/forward re-resolve without the
  version check. Only a newer link version acts (notice "Reload to update", URL kept so the reload opens the
  link); older links route normally. A link skips onboarding and the resume offer without marking
  onboarded (agent decision – reversible).
- `index.html` uses absolute paths (relative ones break under `/entry/…`). `client/public/.htaccess` (Apache)
  and `_redirects` (Netlify) answer every path with `index.html`; Vite dev/preview do it already.
- Removed: `utils/url-params.ts` (`getUrlParam`, unused), `RouteResolver.getUrlForRoute`, the `message` param
  of `/error`, `h` and the content-hash option in the QR generator.
- [x] (user) A link to an entry the reader hasn't consulted yet opens scan mode on the entry's spread instead
      (no shortcut past the game); consulted entries open directly.
- [x] (user) No backwards compatibility below 1.1.0 **for any feature** (RULES #10): old `?code=` links are not
      read. Checked the code: no other pre-1.1 shims left (camera / iOS / MindAR fallbacks are device-related).

## 2026-09-25 – Bookmarks and notes removed (Tilman)

- (user) The bookmark + note feature is removed completely: `<entry-actions>`, `icons.ts`, the "Bookmarked"
  filter (`BOOKMARKED`, `EntriesFilter`, `ENTRIES_FILTERS` – the filter is the `EntryCategory` again), row
  markers, `HistoryManager.setMarked/isMarked/setNote/getNote`, `ProgressRecord.marked/notes` (the format-1
  reader drops them from stored records – same format, no conversion needed), the debug-overlay tables,
  `goldButton`'s `icon` option and `goldButtonContent()` (only used there), tests and docs.
- Lesson: an import used only for types is dropped when compiled – `entry-page` and the component test lost
  element registration that way; both got a side-effect import (RULES #19).
- The designer email question 2 (bookmarks and notes) is obsolete.

## 2026-09-25 – Import cleanup (Tilman: "continue clean up")

- Barrels added/completed: `services`, `styles`, `pages` (now `export *`), `components/scan`,
  `components/camera-permission`, `components/header` (+ mark-the-page, entries-counter), `utils` (+ version,
  progress-record), `types` (+ qr), `components` (+ consultation, scan). ~60 imports rewritten; `types/*.ts`
  import siblings; no runtime cycles (checked with a graph script). Convention = RULES #19.
- [x] (user) `camera-permission` moved to `pages/camera-permission-page.ts` (`<camera-permission-page>`,
      `CameraPermissionPage`): a state-driven overlay without route, like `loading-page`.

## 2026-09-25 – Old artefacts removed, goldButton() (Tilman)

- (user) Removed, as listed in the open items here: dev views `/index` (`index-page`, `components/dev-index`) and
  `/spreads` (`spreads-page`), `<navigation-bar>` with the old `components/buttons` (index / spreads buttons),
  `close-button`, `text-button`, `components/icons`, the undefined `<app-router>`, `src/main.html`, the
  deprecated `public/assets/targets|images|videos`, `tutorial-step-3/4/5.svg`, empty `three-bridges/`,
  `IPageRouter`, `ILoadingPage`, 6 unused error codes, the old light tokens (`--primary-*`, `--secondary-*`,
  `--color-primary|secondary|background|border`). Body text, `Page` base and startup error screen use the
  design tokens now; the QR generator (debug overlay) is a light panel with a design button.
- (user) Option A for buttons: `goldButton()` / `goldButtonContent()` in `components/buttons/gold-button.ts`
  (markup helper, native `<button>`). All 13 design buttons use it (home, tutorial, header, Info, error page,
  entries filter, bookmark, add note, QR download). Rule in RULES #18.

## 2026-09-25 – Consultation pages split into components (Tilman)

- `components/consultation/`: `<entries-filter>` (category pill + menu, navigates; closes on outside tap / Escape),
  `<entries-list>` (`setEntries(filter, entries)`, rows navigate to `/entry`), `<entry-detail>` (`entry`),
  `<entry-actions>` (`entryId`; bookmark + note, saves on change / blur / removal). The pages only read the
  route, compute filter + count and pass data down. Barrel `@/components/consultation` registers them.
- `EntriesFilter`, `BOOKMARKED`, `isEntriesFilter`, `filterLabel`, `ENTRIES_FILTERS` live in `entries-model.ts`
  (used by page, filter and list). `escapeHtml` / `paragraphs` moved to `utils/strings.ts` (tutorial, home, info
  used them too).
- Lesson again: component styles that must beat the adopted design sheet need more specificity (`:host .pill`).
- [x] Buttons + removal: see the next entry (2026-09-25, done).

## 2026-09-25 – components/index → components/dev-index (Tilman)

- (Removed later the same day with the dev views.) The folder was a leftover of the old index view. Renamed, which also
  fixed two import bugs: `components/index.ts` re-exported itself (`./index` resolved to the file, not the
  folder) and `index-page` imported the whole components barrel via `@/components/index`.
- [x] Import cleanup done 2026-09-25 (RULES #19)

## 2026-09-25 – Docusaurus removed, plain markdown docs (Tilman)

- `docs/` is plain markdown that GitHub renders: `docs/README.md` (index, development, build, deploy,
  architecture) + one file per topic (content, content-build, game-store, base-store, managers, pages,
  error-page, components). No site generator, no package. The Docusaurus blog and homepage are gone.
- Root `README.md` = super short quick start with Mark (`docs/assets/mark.png`: Mark on black, because the
  white Mark is invisible on GitHub's light theme).

## 2026-09-25 – Docs updated (Tilman)

- New root `README.md` (quick start: install, content build, dev, checks, builds incl. AR strategies, version).
  `docs/` rewritten for the current model: intro (getting started), content structure + build (spreads,
  entries, entities, steps, `.mind` compile order, chroma key), game store, managers, pages, components.
- Removed stale docs: `docs/docs/README.md` (Glitch, canvas workaround), Docusaurus boilerplate
  `docs/src/pages/markdown-page.md`, outdated copies `client/src/pages/PAGES.md` / `ERROR-PAGE.md`.
- [x] (removed 2026-09-25) `<navigation-bar>` (+ index/spreads buttons) is always hidden (`display: none`) and `<app-router>`
      in `main.ts` is not defined anywhere – removal candidates, ask Tilman.

## 2026-09-25 – Progress reading moved to utils (Tilman)

- `store/managers/progress-readers.ts` → `utils/progress-record.ts`: pure helpers (create a record, read a stored
  one per format), not a manager; used by HistoryManager and GameStore. Pure tests in
  `utils/__tests__/progress-record.test.ts`; storage/notice tests stay in `HistoryManager.test.ts`.

## 2026-09-25 – Entry categories as a shared enum (Tilman)

- `EntryCategory` is a string enum in `shared/types/entry.ts` (values = the YAML strings); `ENTRY_CATEGORIES`
  is derived from it. The build schema, the shared guard and the app use it; the client re-exports it from
  `types/entries.ts`. The duplicate list in `scripts/src/config.ts` is gone. `isCategory` in the app = `isEntryCategory`.
- Values are **singular** (Tilman): `glossary`, `video`, `text`, `link` – the category of one entry.
  Labels are derived from the values (`categoryLabel`): plural everywhere as in the design ("Videos", Tilman);
  the glossary has no plural. Content YAML and tests switched; stored `lastCategory` values from before are dropped.
- `EntriesFilter` (category | "bookmarked") stays local to the entries list (`pages/entries-page.ts`).
- Consultation: category menu matched to the design, Bookmarked as 5th menu item, note field behind "Add note".
- [x] (user) Does "Glossary" mean all entries? No – the design has no unfiltered view: the dropdown "shows all
      consulted entries, per category" (frame 17), "the four different types of entries" (frame 18); the count
      is glossary entries / total glossary entries. Glossary = glossary entries only (as built).

## 2026-09-25 – Session paused before Phase 7

- [x] (user) Phase 7 (Mark WebM, device tests, haptics) is on hold until Tilman's extensive device testing.
      Phases 2–6 built on `design`. Open for the next session: designer answers (DESIGN.md §8), review #15
      (loading concept), entries without a target (PLAN Phase 4), ~~default AR strategy~~ (persistent, 2026-09-26),
      deep links (Tilman), removal candidates (dev views, old tokens, unused illustrations, text-button).

## 2026-09-25 – Phase 6 strategy B: PersistentArScene (Tilman)

- [x] (user) Second, swappable strategy that keeps one scene and swaps targets / content / entities.
      Shared base class `BaseArScene` (queue, status, start/pause/stop); A and B only differ in
      `changeSpread`. Switch: `ar/index.ts` (`AR_SCENE_STRATEGY`, default "rebuild"), dev override
      `localStorage["osct-ar-strategy"] = "persistent"` + reload.
- [x] B swap: stop + dispose the controller, remove old anchors/assets (shared asset ids stay), reset
      `system.anchorEntities` (anchors register on init, never unregister), set `imageTargetSrc`, add new
      content, `_startAR()` on the running video. Camera off → content only, next start loads the new .mind.
- [x] (user) Build flag `VITE_AR_STRATEGY` (+ `build:ar-rebuild` / `build:ar-persistent` / `dev:ar-persistent`,
      mode files `client/.env.ar-*`) to compare the strategies per device; verified in real builds; debug
      overlay shows the active strategy.
- [x] Measured (fake camera): B 0.42–0.51 s per switch and no camera request; A 0.6–3.6 s and one request
      per switch. Default stays A until device tests (PLAN Phase 6).

## 2026-09-25 – Phase 6 strategy A: ArScene + <ar-bridge>

- [x] (user) Decisions: one `<ar-bridge>` + `IArScene`; strategy A (new scene per spread) first; camera only
      in scan mode; old bridges removed after it worked; `link` entity dropped. B (persistent scene) next, as a
      separate, swappable implementation (`ar/index.ts` `AR_SCENE_STRATEGY`).
- [x] Built: `ar/ar-scene.ts` (queued reconcile: newest spread + state win), `ar/entities.ts` (registry:
      video + chroma key, model, image), `ar/mindar.ts` (safe stop in every MindAR state, `autoStart: false`,
      anchors), `ar-bridge.ts`, store `arStatus`. Removed (Tilman's okay): static-scene-bridge, scene-bridge,
      target-bridge, templates, connectScene, createScene/Entities/Assets, target listener utils, videos
      util, `static/*.ref.ts`, the commented scene in index.html, SceneService.
- [x] Browser (fake camera): home = no camera; scan = 1 request, running; consultation = paused, stream kept;
      back = running without a new request; spread switch = 1 scene, 1 live stream; home = camera released;
      rapid switching ends on the last spread; found/lost drives video + store. Pane's denied camera → error →
      camera-permission screen, **one** prompt (a failed start is not retried until the wish changes).
- [x] Fixes the old MEMORY items "camera starts on home" and "stopProcessVideo when switching with a denied
      camera"; trackedTargets are cleared (targetLost) when a scene is torn down.

## 2026-09-25 – Design review: colors measured from the PDF

- [x] (user) "Nail the colors": values extracted from the PDF's vector data into `agents/DESIGN.md`
      (frames are lossy). Key finding: gold is **one linear gradient** (`#f5e7c8 → #7f6032 → #d2ae5a →
      #f3cc94`) clipped by the text, per element; consultation background = black 82 %; pills/"i" =
      transparent body (Multiply) + blurred black shadow; onboarding buttons = black body + white glow;
      Mark 99 × 96 px. The white/gold mix in list titles is the list-wide gradient.
- [x] (user) Glass rule: body `rgba(255,255,255,0.001)` (non-zero alpha, else no backdrop blur) +
      `backdrop-filter: blur`, depth only by a white or black drop shadow.
- [x] (user) The cropped 129 × 20 px Mark image in the consultation frames is a **PDF export error** – Mark is
      exactly the same in the game-header in all modes. Not a question for the designers.
- [x] (user: "i like your proposals") Applied: measured tokens in `main.css` (gold gradient, greys,
      backgrounds, shadows, glass, type, Mark size), shared primitives `styles/design-styles.ts` (constructable
      stylesheet adopted per shadow root), `<gold-illustration>` (any line-art SVG → gold chrome + sweep;
      resolves inherited paint – Penpot exports set `fill="none"` on the root). Onboarding illustrations as on
      main: intro = tutorial-step-1, camera = tutorial-step-2 (Tilman). RULES #18.
- [x] (user) Loading screens restyled: startup loader + loading page = consultation darkness
      (`--loading-background`) + gold spinner (`styles/gold-spinner.css`, one source for both via `?inline`);
      MindAR's loading UI off (`uiLoading: no`). Designer Q4 answered by Tilman: **frosted glass** – yes.
- [x] (user) MindAR's scanning brackets replaced (not just turned off): `uiScanning` takes a CSS selector →
      our `#osct-scanning` circle (gold fading in from transparent, sweeping; `styles/gold-spinner.css`).
      Verified: MindAR toggles it and creates no brackets.
- [x] (user) The page background was still the old light grey (`--color-background` on body) → black
      `--app-background`, `color-scheme: dark`. Error page (also the resume notice) and not-found restyled in
      the consultation look (black 82 %, white text, glass pills with gold labels).
- [x] (removed 2026-09-25) Old light tokens (`--color-background`, `--primary-*`) remain only in the dev views (index, spreads)
      and `text-button` – removal candidates with those views.
- [ ] Device check: `background-clip: text` over descendants (the list-wide gradient) on iOS Safari.
- [x] Lesson: happy-dom's XML parser drops an SVG that contains a `<style>` block (Penpot font imports) –
      test SVGs without it. Adopted stylesheets cascade **after** a component's own `<style>`.

## 2026-09-25 – Phase 5 onboarding built

- [x] (user) First visit → onboarding; "Skip" and finishing mark the reader onboarded (progress field
      `onboarded`); Info keeps a "Tutorial" button. Home restyled like the splash – confirmed ("what i saw
      was good"); a short-lived revert to the old home layout was undone.
- [x] (user) Camera-permission (denied) screen restyled after the onboarding; gold chrome icon with a
      skeleton-style sweep injected into the SVG; gold scale `--gold-100…900` added to the tokens.
- [x] Onboarding steps are content (5 steps, old 6 replaced); step contract extended (button, action,
      fadeIn, advance, footer; title/description optional).
- [x] Camera starts with the scene (MindAR autoStart) before "Grant access" – obsolete, camera only in scan mode (RULES #12).

## 2026-09-25 – Phase 4 consultation mode built

- [x] (user) Mark looks the same in both modes: the thin "consultation" strip in the frames is the regular
      Mark cut off by the PDF → PNG conversion; the dark parallelogram next to it is a glitch too.
      `public/assets/ui/mark-the-page/consultation.png` removed.
- [x] (user) Removed artefacts of the previous design iteration: the scan page's spread card (top left)
      and the header name line "Kevin Bray — Onion Skin and Crocodile Tears". `game-header` now only holds
      the top chrome (Mark, counter, "Entries", "i"); IDLE shows nothing there.
- [x] (user) `Preloader` → `PreloaderService` (class + file); services naming rule in RULES #17.
- [x] Agent decisions (reversible): `/index` kept as a dev view (dev-only bottom bar with index + spreads
      buttons); Info = about restyled, close button dropped; "Bookmarked" as a 5th option in the category
      dropdown; locked entries in dev via `showLockedEntries()` / `VITE_SHOW_LOCKED_ENTRIES`.
- [x] Fixed: a `PageMinimal` page with fixed children needs a full-viewport host – the page transition's
      `transform` makes the host their containing block (the spread menu vanished after the card was removed).
- [x] Fixed: the tutorial's last step went to `/spreads` (dev view) → now `/spread` (scan).
- [ ] Open (PLAN Phase 4): entries without a target can't be consulted by scanning; list colours (white /
      gold in the frames); final Info texts; `index-page` & co. as removal candidates.
- [x] (user) `game-header` keeps its name – it is the header holding Mark, counter, "Entries" and "i".

## 2026-09-25 – Phase 3 scan mode built

- [x] Chrome per mode in `header.ts` (agent decision, **confirmed by Tilman**): the name line only in IDLE; Mark +
      counter in SCAN/CONSULTATION; "i" in CONSULTATION keeps About reachable (the header was its only
      link). Navigation bar (index button) only in CONSULTATION; in SCAN the spread menu replaces it.
      The `/spread` spread card (only link to the `/spreads` dev view) is shown in dev builds only.
- [x] `/index` got an optional `entryId` param (found indicator opens the entry) – Phase 4 replaces it
      with `/entry`.
- [x] (user) Chroma key for AR videos – see PLAN Phase 3. artificialmuseum.com: the public map page is
      SvelteKit + MapLibre; its AR viewer wasn't found in the web bundle (likely the native app), so
      the standard OBS / three.js-forum shader was used. Default similarity 0.3 (not 0.4) after measuring.
- [x] (user) Loading overlay concept review added to PLAN Phase 3 (full-screen loader on every spread switch).
- [x] (user) Demo content had no target without AR entity → Shadows' `link` entity dropped; scanning
      Shadows (spread1) now shows the found indicator.
- [x] (user) Loading overlay + indicator-in-consultation are reviews #15 / #16 in the PLAN decision table.
- [x] Lesson (browser tests): Vite serves a module under `?t=` after HMR – patch the instance the app
      loaded (check `performance.getEntriesByType('resource')`), not a fresh import. The pane's
      Permissions API resets the camera state to "denied"; hide `camera-permission` for UI checks.

## 2026-09-25 – Preloader

- [x] `services/PreloaderService.ts`: neighbouring spreads (±1) on `arReady` – `.mind`, then (user) their content
      (entity assets, entry images; videos last). Uses the `LoadOptions` / `LoadResult` types kept for this.
      Not all spreads: ~1 MB `.mind` each, the final book has many spreads.
- [ ] Open: ~~production cache headers for content~~ (the CDN's); iOS range requests for preloaded videos (Phase 7).
- [x] Lesson: PowerShell 5.1 `Get-Content -Raw | Set-Content -Encoding utf8` mangles non-ASCII (reads ANSI)
      and adds a BOM – use the Edit tool (or Bash `sed`) for file edits.

## 2026-09-25 – Phase 2 step 3 done (debug overlay progress tab)

- [x] Debug overlay: tabs *spread* (as before) / *progress* (record, missing ids in red, reset button;
      reset asks via `confirm()`). What to do with missing ids is still open → trial/beta.
- [x] (user) Deprecated demo `.mind` files in `client/src/targets/` removed by Tilman (commit ccb59e9).

## 2026-09-25 – Phase 2 step 2 done (progress storage)

- [x] (user) **No conversion of storage from before 1.1.x** – the app was never deployed publicly. The
      first progress format is 1; the old `ar-game-target-history` / `ar-game-config-version` keys are ignored.
- [x] Progress record per book keyed by stable ids (unlocked targets, consulted entries, marked, notes,
      last spread / category, app version history). `IHistoryManager` rewritten around it (old numeric API
      and `resetSpreadHistory` removed – no callers). `state.history` / `state.configVersion` → `state.progress`.
- [x] Fixed on the way: the index "seen" dot never updated (subscription commented out, `spread-id` /
      `target-index` attributes never set) → `target-item` shows Not found yet / Unlocked / Consulted by id.
- [x] Browser (camera blocked, targets unlocked via `window.BOOKGAME`): record saved, resume offer at
      startup, Resume → spread + scan, expanding an entry → consulted, survives reload.
- [ ] The index still lets you open entries that are not unlocked (→ consulted without unlocked). Phase 4
      hides/locks unconsulted entries.
- [ ] Pre-existing: the resume notice goes through `notifyError` (logged as console error, `currentError`
      stays set after "Resume"). Candidate for `Pages.NOTIFICATION` (Phase 3).

## 2026-09-25 – Phase 2 step 1 done (one version), QR links carry the content hash

- [x] App + content build read the version from `client/package.json` (no `npm_package_version`).
      Startup: other MAJOR → critical `NOT_SUPPORTED` screen; MINOR/PATCH → console note. Tests check
      both `package.json` versions, the app define and `game.config.json` against each other.
- [x] (user) Dev QR generator links carry the version ingredients: `osct=<semver>&h=<content hash, 12>`.
      What to do with conflicting incoming links is decided later (PLAN Phase 2 deep links).
- [x] (user) CI added: `.github/workflows/ci.yml` on every push/PR – scripts `tsc` + build + "committed
      `game.config.json` is up to date" (content build must skip = no diff), client `tsc` + `vitest`.
      Deployment stays separate: Netlify builds `main`; FTP production deploy is optional, Tilman adds it later.
- [x] Lesson: `preview_start` may reuse a vite process that read `package.json` before an edit – check
      the `> osct-book-game@x.y.z dev` line in the preview logs after changing the version.

## 2026-09-25 – Versioning + progress storage concept (Tilman)

- [x] One semver version for app + content build; `client/package.json` = source, `scripts/package.json`
      kept equal (tests + CI, not the build). RULES #10 rewritten – the old rule (each keeps its own
      version history) was a misconception (Tilman).
- [x] Session handover: this long session ended here; implementation steps 1–3 are in PLAN Phase 2
      ("Implementation steps (next session starts here)"). No code changed for them yet.
- [x] Game configuration: PATCH/MINOR just work, MAJOR = rebuild content; **no config migrations**
      (DB + API later, migrations would be overkill now).
- [x] Progress storage: stable ids; two discovery stages *unlocked* (target found) and *consulted*
      (entry opened); per entry **bookmark** + **note** (UI in Phase 4: filter "bookmarked", list
      indicators, icons from Tilman). Records the app version history; a new MAJOR still reads the old
      format, converts it and informs the user.
- [x] Ids missing from the content are kept; a debug overlay tab shows the progress state and marks
      them – decide in trial/beta.
- [x] Found while analysing: both version stamps come from `npm_package_version`, which is missing
      outside `npm run` (`node dist/index.js` stamped `1.0.0`; `npx vite` would give `undefined`).

## 2026-09-24 – Code placement (RULES #17)

- [x] (user) Scene state policy (`getSceneState`, `isOverlayRoute`, `SCENE_STATE_BY_MODE`) lives in the
      A-Frame context: `components/aframe-bridges/utils/scene-state.ts` (test next to it). MindAR is an
      A-Frame plugin; the bridges are the A-Frame context inside the app. A short-lived move into
      `SceneService` (commit cfd0674) was reverted: `SceneService` is itself A-Frame specific and is
      replaced by `ArScene` inside the bridge context in Phase 6 – no new logic there.
- [x] (user) `utils/game-config.ts` is a primitive service → moves to `services/` with the data access
      work (PLAN Phase 2 versioning). Not moved yet.
- [x] (user) Empty `components/slotted-page/` removed (untracked, empty). `components/three-bridges/` is
      empty too – [x] removed 2026-09-25. ~~Old `.mind` files in `client/src/targets/`~~ (removed by Tilman,
      ccb59e9) and the old test page `client/src/main.html` (points at `/targets/single-image.mind`) → Tilman's cleanup.

## 2026-09-24 – Mode vs scene state, overlays pause the scene

- [x] (user) Question: what separates SCAN, VR and CONSULTATION if consultation is an overlay? → Two
      dimensions were mixed. Mode = UI context (design); scene state = derived from mode + route.
      VR removed (user okay): never set, A-Frame VR UI disabled everywhere; enum value, 2 error codes,
      `exitVR()` calls gone.
- [x] (user asked to check) Should overlays stop the scene? Checked: the design's consultation is dark and
      slightly transparent (the scan view shows through faintly, frames 15/17) → a frozen frame looks the
      same. Measured: consultation and overlays only paused A-Frame, **MindAR kept tracking** underneath.
      Decision: overlays pause the scene (resources + no targets firing behind a page).
- [x] MindAR emits `arReady` and starts tracking itself right after → the bridge applies the scene
      state on the next tick, otherwise the pause is overridden (seen in the browser, fixed).
- [x] Verified in the browser (fake camera): tracking only in scan without overlay; paused in home,
      consultation, error/not-found overlays and after a spread switch while consulting; one live stream.

## 2026-09-24 – Phase 2: modes vs views implemented, git over SSH

- [x] Modes/routes as planned (see PLAN Phase 2). `GameMode.DEFAULT` is now `SCAN`; `CONSULTATION` is new
      (index, about → scene paused). Close / START / resume / last tutorial step all reach scan mode
      through the route, not by setting the mode.
- [x] The scene is still *playing* in IDLE (home) – obsolete with the 8th Wall engine (camera only in scan mode).
      Covered by "camera only in scan mode" (Phase 5 "Grant access" / Phase 6 `autoStart: false`).
- [x] TF.js warns "High memory usage in GPU" after several scene switches – obsolete, TF.js left with MindAR →
      check on devices in Phase 7 ("memory when switching groups").
- [x] (user) `origin` switched to SSH (`git@github.com:mandymozart/osct.git`); the user's SSH key
      authenticates, so agents can push. HTTPS had no credential helper configured.

## 2026-09-24 – Game configuration errors: build time vs runtime

- [x] Two layers, both kept (user agreed): `GameConfigurationError` (shared guard) = developer detail,
      every problem with its path; used by the **build** (collects them, exit 1) and logged by the app.
      `ErrorCode` + `ErrorInfo` = the **app's** error contract (code, message, type, details).
      `shared/` must not depend on app types; an assertion function has to throw to narrow.
- [x] Mapping at the app boundary: `utils/game-config.ts` catches the guard error, logs the problems,
      keeps `ErrorInfo { code: ErrorCode.GAME_CONFIGURATION_INVALID, type: "critical", details }` and
      falls back to an empty model so modules can load. `main.ts` checks `getConfigurationError()`
      first and renders a critical error screen instead of the app (no scene/camera), hides the loader;
      problem list shown in dev only. Before: the app hung on "Loading book" with the error only in the console.
- [x] The "page is part of a spread" rule moved into the shared guard (the app model maps entries to
      spreads by page; a config that passes the guard can always be mapped).
- [x] *(done – `checkContentCompatibility` → `ErrorCode.NOT_SUPPORTED`)* Phase 2: the startup compatibility checks (app ↔ content ↔ storage) use the same path, e.g.
      content ahead of app → `ErrorCode.NOT_SUPPORTED`.

## 2026-09-24 – Unused types audit (cleanup by Tilman, see RULES #15)

Scanned `client/src`, `shared/`, `scripts/src` (exported types + enum members). Not counted as unused:
custom element classes (used by tag name), `.d.ts` declaration merging (`HTMLElementTagNameMap`,
`ImportMeta`, MindAR `Components`/`Systems`), `I*` component interfaces used by their own `implements`.

**Keep – part of a phase (use or drop there):**
- Phase 2: `LoadOptions`, `LoadResult` (`types/loader.ts`, early asset loader → `.mind` preloader);
  `ErrorCode.NAVIGATION_FAILED` (unreachable not-found route); `ErrorCode.NOT_SUPPORTED`,
  `NETWORK_ERROR` (versioning: content ahead of app, later CDN).
- Phase 3: `ErrorCode.SPREAD_LOAD_FAILED`, `SPREAD_NOT_READY`, `IMAGE_TARGET_NOT_FOUND` (spread menu);
  `ErrorCode.ENTITY_LOAD_FAILED`, `ASSET_NOT_FOUND`, `ASSET_TYPE_INVALID`, `ASSET_LOAD_FAILED`,
  `ASSET_NOT_READY` (video autoplay / entity loading); `Pages.NOTIFICATION` (no page yet – resume offers
  reuse the error page; candidate for "New entry unlocked" / notifications).
- Phase 5: `ErrorCode.CAMERA_PERMISSION_DENIED` (onboarding "Grant access").
- Phase 6: `EntityEvents` augmentation (`asset-loaded`, `asset-failed`, never emitted – entity registry);
  `scene-bridge.ts` (`SceneBridge`, not registered – artefact, decided to keep until Phase 6).
- VR (left untouched by the plan): `ErrorCode.FAILED_TO_ENTER_VR`, `FAILED_TO_EXIT_VR`.

**Removal candidates (no plan item) – check for duplicates/redundancy first (RULES #15):**
- [x] (removed 2026-09-25) `IPageRouter` (`types/router.ts`, `navigate()`/`close()`) – looks superseded by `IRouterManager`.
- [x] (removed 2026-09-25) `ILoadingPage` (`pages/loading-page.ts`) – declared, not implemented by `LoadingPage`.
- [x] (removed 2026-09-25) `ErrorCode.UNKNOWN_ERROR`, `INITIALIZATION_FAILED`, `NOT_READY`, `SPREADS_LOAD_FAILED`,
      `SOME_ASSETS_NOT_FOUND`, `ENTITY_NOT_FOUND` – generic or overlapping with the codes above.

**`page` on entries is not legacy** (checked 2026-09-24): the design shows "Access page 186" in every
entry detail ("Go to access page 186 in scan mode to see the video"); the spread menu shows the spread
range ("Pages activated: 24–25"). `page` stays the single source: the spread is derived from it
(an explicit `spread` field would be redundant and could contradict the page). The legacy field was
the per-target `bookId`.

## 2026-09-24 – Phase 1e done (content model + types)

- [x] Content migrated with `git mv` (history kept): targets nested into entries, media next to the
      entry, `castle` became a shared entity (`content/entities/castle`, `ref: castle`) to exercise refs.
      Removed: `content/targets/`, `*.asset.yaml`, per-target `.mind`, `relatedTargets`, `relatedSpread`,
      `hideFromIndex`, per-target `bookId`, `scripts/src/types/*`, `client/src/types/{assets,entities,content}.ts`.
- [x] Target ids are now entry ids (`target-003` → `old-castle`). Scene element id = target id; the
      listener gets the MindAR index from the configuration (no more number parsing). `trackedTargets`
      = target ids.
- [x] History stays numeric (decision b) but the number is now the **MindAR index** (before: the number
      parsed from the target id, e.g. 3/4/6/7 for spread2 – which also made completion % wrong).
      Saved dev history from before 1e may point at different targets. Proper rekey: Phase 2.
- [x] `link` entity has no asset any more: it renders the entry's title/body; the URL is the entry's `media`.
- [x] Fixed on the way: video asset markup had `playsinlinecrossorigin` (one word) → neither attribute was set.
- [x] Edge is now listed in the index (hideFromIndex dropped); index rows show the page instead of `bookId`.

## 2026-09-24 – Content model + type naming (→ Phase 1e)

- [x] (user) Bundle types keep the **`*Data`** suffix ("loaded from JSON", DTO). App-internal objects use plain
      names (`Spread`, `Target`, `Entry`, `Step`); services/controllers `I*`; runtime state `*State`.
      `EntityData` = description of an A-Frame entity.
- [x] (user) The game-configuration contract (`*Data` + guards) lives in a top-level `shared/` folder used by
      client and build; all other types stay in `client/src/types`.
- [x] (user) Single source of truth: only `utils/game-config.ts` reads `game.config.json` (type guard → map).
- [x] (user) Vocabulary: content = authored input; game configuration = build output (`game.config.json`
      keeps its name, root type `GameConfiguration`); `*Data` = its parts. `utils/content.ts` was renamed
      to `utils/game-config.ts` (test `game-config.test.ts`) – a third rename, now following this vocabulary.
- [x] (user) Drop `hideFromIndex` in 1e; `TutorialStepData` → `StepData`.
- [x] (user) The future data access is **an API generated by a tool** with several services
      (e.g. `UserService`, `NotificationService`) – not a hand-written `GameConfigService`/`ContentService`.
      `utils/game-config.ts` is the interim loader that this API will replace or feed.
- [x] (user) Nest the target in the entry; target id defaults to the entry id (no conflict with the MindAR
      index, which is positional). Entities inline **or** `ref` to `content/entities/<id>`; no logic in content.
- [x] (user) `book.yaml` with `id: osct`; drop `relatedTargets`; keep `tags` (not in the design – only the four
      categories – but useful for a future content manager / frontend filters).
- [x] (user) History stays numeric until Phase 2 (option b).
- [x] Agent proposal: no `*Source` interfaces – YAML is parsed (`unknown` → validated → `*Data`); the schema
      holds the authoring rules. Bundle mirrors the source nesting; no reverse references in the JSON
      (indexes are built in memory – all content is loaded at startup anyway).

## 2026-09-24 – Content build checksum

- [x] (user) Build computes a sha256 over `content/`, `scripts/src/` (build logic) and the package version
      (text line endings normalised). Same hash as in `game.config.json` + public copy present →
      exit early, nothing rewritten, timestamp unchanged. `--force` rebuilds. Tested: first build,
      unchanged rerun (file untouched), content change, undo (hash back to the original), `--force`,
      missing public copy.
- [x] No more manual revert of timestamp-only `game.config.json` changes.

## 2026-09-24 – Phases renumbered to execution order

- [x] (user) Phase numbers now follow the order of work: 2 State · 3 Scan (was 4) · 4 Consultation
      (was 5) · 5 Onboarding (was 3) · 6 A-Frame bridges · 7 Polish. References in agents/*.md and code
      comments were updated; **commit messages before this date use the old numbers**.
- [x] Reference scenes renamed `static/spread{1,2,3}.ref.ts` (+ `static/README.md`); still not imported.

## 2026-09-24 – A-Frame bridges: Phase 6, keep the static bridge until then

- [x] (user) Clean A-Frame bridge API (`ArScene` + one `<ar-bridge>`) becomes **Phase 6**; Polish moves
      to **Phase 7**. Phases 2–5 keep working on the current bridge; fix issues as we go.
- [x] The DOM-replacement approach (`static-scene-bridge` injects scene HTML via `innerHTML`) is
      **deliberate**: injecting entities / resetting targets dynamically caused issues before; replacing
      the DOM lets the browser handle it and target listeners reconnect correctly.
      `scene-bridge.ts` is an artefact of that earlier attempt.
- [x] Clarified: the live scene HTML is generated from `game.config.json` by `utils/templates.ts`
      (content-driven). `static/spread{1,2,3}.ts` (now `.ref.ts`) and the commented scene in `index.html` are not
      imported – kept as reference until Phase 6.

## 2026-09-24 – `utils/config.ts` renamed to `utils/content.ts` (later → `utils/game-config.ts`)

- [x] (user) The client module only reads built content, it configures nothing → `utils/content.ts`
      (test: `utils/__tests__/content.test.ts`). `scripts/src/config.ts` stays: it is real build config.
- [x] ~~Later an async `ContentService`~~ → superseded: a tool-generated API (see the 1e entry above).
- [x] ~~Rename `game.config.json` → `content.json`?~~ → no, it keeps its name (user).

## 2026-09-24 – Spread switch reload loop fixed

- [x] Reported by user: switching spreads caused a reload loop. Cause: `StaticSceneBridge.activate()`
      called MindAR `unpause()` before the `.mind` targets were loaded (`controller` exists early,
      `markerDimensions` is set later) → throws → the catch re-ran `setupScene()` (rebuilds the scene and
      duplicates store listeners) → same race again. Fix: activate only after the scene's `arReady`
      event; no re-init in the catch. Pre-existing, not caused by the maxTrack change.
- [x] Fast switching raced (older load finished last → wrong scene, leaked camera streams). Scene loads
      are now queued; each step loads the spread wanted at that moment (stale ones are skipped).
      This was the Phase 3 "guard against stale loads" item. Debounce for the scroll menu still Phase 3.
- [x] Verified in the browser pane with a fake camera (canvas `captureStream`, one fresh stream per
      `getUserMedia` call – reusing one stream breaks MindAR restarts because `stop()` ends its tracks):
      5 sequential + 4 rapid switches → right `.mind`, 1 scene, 1 live camera stream, no errors.
      User tested the changes on 2026-09-24 ("tested everything") – no issues reported.
- [x] *(done – targets are keyed by id since 1.3.2)* (fixed in 1e, section E) Target listeners use the number in the target **id** as "index" (`target-003` → 3), not the
      MindAR index; history is keyed by it. Works but fragile → Phase 2 history rekey.

## 2026-09-24 – Phase 1d done (entries) + Phase 0 constant

Agent decisions (reversible, flagged for review):
- [x] Entry → target link lives on the **entry** (`target: target-000`), since an entry may have a target.
- [x] The 6 demo 3D-model targets became **glossary** entries (categories are fixed; 3D models are demo
      leftovers). The 3 demo videos → videos, Shadows → links.
- [x] Shadows keeps its target entity type `link` (client scene code unchanged) **and** the entry has the
      URL as `media`. The duplication goes away when entities are reworked (Phase 3: target without AR
      entity → found indicator).
- [x] Two scene builders set `maxTrack`: `templates.ts` (used by `static-scene-bridge`) and
      `createScene.ts` (used by `scene-bridge`). Both used `targets.length`; both use the constant now
      (verified in the browser: `maxTrack: 5`). Two parallel scene bridges → worth a look in Phase 3.
- [ ] Build validation stops at the first blocking error per entry (e.g. duplicate target), so later
      checks for that entry show up on the next run.

## 2026-09-24 – Phase 1c rename done (chapter → spread)

- [x] Demo spreads now cover pages **1–2, 3–4, 5–6** (like the final book). Only page ranges changed;
      target assignment and `.mind` files unchanged.
- [x] `target-000` "Shadows" restored (user found the missing image `images-000.jpg`, 254×650 = the
      size compiled into `spread1.mind`). It had been silently dropped by the build while still being
      image 0 in `spread1.mind` → spread1 targets were off by one in AR. Now 10 targets, spread1 =
      Shadows (link), Racoon, Ancient Tree, Sleeping Dragon, matching the original `.mind`. (A short-lived
      removal in `6ad6d8e` was rolled back.) New test: each spread `.mind` must contain exactly its
      targets' images in `mindarTargetIndex` order. The "files exist" test skips external link URLs.
- [x] Unreferenced `target-000/images-010.jpg` deleted (user), incl. its copy in `client/public`.
- [x] ~~Build never removes stale files in `client/public`~~ – wrong: `copyContentToPublic` already
      deletes the folder before copying. The stale file only lingered because the build hadn't run yet.
- [x] 1d: the build should **fail** (not skip) on a missing target image (done in 1d), and ideally run the same
      `.mind` ↔ targets check.
- [x] ~~Dead code: `static/spread{1,2,3}.ts` + commented scene in `index.html`~~ → kept as reference
      (user), renamed to `*.ref.ts`. See the Phase 6 decision above.

- [x] Rename done in code, content, build script, routes, tests (see PLAN 1c). QR prefix `c-` kept.
- [x] Saved history from before the rename (`chapterId` entries, or spreads that no longer exist) is
      dropped on load instead of offering a broken resume (`HistoryManager.loadTargetHistory`, tested).
      Proper migration → Phase 2 (stable IDs + content version).
- [x] `docs/` (Docusaurus) still uses chapter terminology throughout – update or retire later.
      → Rewritten and Docusaurus retired on 2026-09-25 (plain markdown).
- [x] `client/public/assets/targets/chapter{1,2,3}.mind` are unreferenced legacy files. → Removed 2026-09-25 (Tilman).
- [ ] Pre-existing bug (not from the rename, verified on the pre-rename commit): switching spreads
      while MindAR never started (camera denied) throws `Cannot read properties of undefined (reading
      'stopProcessVideo')` from MindAR during scene teardown (`static-scene-bridge.ts`). Guard in
      the scene bridge, relevant for Phase 3 spread menu switching.
- [x] Lesson: on Windows the running vite dev server locks files. **Stop the preview server before
      `git stash` / `git checkout` / `git reset`** – a stash with the server running half-reset the tree
      (recovered fully from the stash, verified identical).

## 2026-09-24 – Phase 1a done (QR removed)

- [x] QR scanning removed completely (components, manager, types, utils, deps `jsqr`,
      `qrcode(.min).js`, `GameMode.QR`, QR error codes).
- [x] The client had **no test files**. Added a basic suite (27 tests, `client/src/**/__tests__/`):
      `BaseStore` (change detection, cleanup, immutability), `RouteResolver`/`RouterManager`,
      `HistoryManager` + `TargetManager` (seen/persist/resume/corrupt storage), and a
      **content-config** check on the built `game.config.json` (≤ 5 targets per group, MindAR indices
      0..n-1, unique ids, referenced files exist in `public/`). These guard Phase 1c/1d/2.
- [x] *(done – an unknown slug routes to not-found, `RouterManager.ts`; no `it.fails` left)* Found by the tests: `RouterManager.navigate()` with an unknown slug **throws** in
      `RouteResolver.createRoute`, so the `/not-found` branch is unreachable. Documented in a test;
      fix in Phase 2 together with `isSameRoute` (that one is an `it.fails` test – drop `.fails` when fixed).
- [x] Browser smoke run (in-app browser, camera blocked there): home, tutorial, scan HUD, index open
      without console errors; nav bar now only shows INDEX. AR tracking needs a real device.
- [x] ~~Keep `hideFromIndex` as an entry flag~~ → dropped in 1e (user; the design's hidden-unconsulted flag covers it).
- [x] **Dev overlay QR generator is kept** (user, 2026-09-24): needed to open the dev server on a
      phone for testing. It was removed in 1a by mistake and restored (`qr-generator.ts`,
      `types/qr/qrcode.ts`, `qrcode.js`, `window.QRCode` type). Only in-app QR *scanning* is gone.
      Options trimmed to **Valid** + **Wrong App Version** (invalid code / wrong chapter / plain text removed).
- [x] Versions: **app version** = `game.version.version` (`__VITE_APP_VERSION__` ← `client/package.json`);
      **content version** = `game.config.json` `version` (← `scripts/package.json`, used by
      `HistoryManager` for storage versioning). The QR `osct=` param is the app version. Fixed
      `osct=undefined` (read a non-existent `import.meta.env.VITE_APP_VERSION`); removed the phantom
      `VITE_*` entries from `ImportMetaEnv` so this can't happen silently again.
- [x] **Printed QR codes are a real entry point** (user): scanned with the phone camera, they open
      `/?code=…&osct=…`. The app does not read these params on load yet → planned in PLAN Phase 2
      "Deep links from printed QR codes". **Owner: Tilman** (agents don't build it).
- [x] **App version ≠ content version** – very important, keep them apart. Content should be versioned
      by the content builder (possibly uploading to a CDN later). PLAN Phase 2 "Versioning".
      **Owner: Tilman.**
- [x] `beta/` (old prototype sandbox) removed on request (2026-09-24). Docs (`docs/docs/*`) cleaned
      of QR; the 2025 blog post stays as history.
- [x] Chapter → spread rename changes persisted history (`chapterId` in localStorage) – no compatibility below 1.1.0 (RULES #10). Existing
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
- [x] Indicator visibility in consultation mode (review after trying) – hidden (PLAN decision #16)
- [ ] Note on PDF p.37–39 (sentence was cut off)
- [x] `maxTrack` → 5 (= max per spread)
- [x] `.windsurfrules` → deleted
- [x] Design PDF stays in the repo
- [ ] Final content → on-site session in Amsterdam, fall 2026
