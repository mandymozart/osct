# Project Memory – OSCT

Decisions and context that are not obvious from the code. Newest first.
Add new entries at the top with a date. Tick `[x]` open items when resolved and note the
outcome in the line (or move it into a dated decision block).

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
**2026-10-31 – plugin code in a sandbox: the editor's stage in an opaque-origin frame (#234)** (`MEMORY-2026-10.md`)
- [ ] **The reader's plugins and the session** (above): Tilman's "no sandbox in the reader" (2026-10-29) predates the
  one cookie for the site (#207), which puts an editor's or admin's session within reach of a published plugin in the
  reader. Whether that changes it is his call: sandbox the reader's scene (camera delegation, the 8th Wall files for an
  opaque origin, offline content), or serve the editor and its API from an origin of their own so the reader's pages
  never hold an editor's cookie (deploy config).
- [ ] **WebGPU in the frame** (the aquarium's fluid): the Inspector says *WebGPU ok · particles 10k* in headless Edge
  (its software adapter) inside the sandbox – a sandboxed frame needs no permission for it; not yet seen on a real GPU.
- [ ] **The frame on the phone** (the S22): frame cost and the sheet's drag over the stage.
- [ ] **A header policy for the frame** would apply before any script, not only before plugin code: it needs the
  content bases per book – a server-side page for the frame, or deploy config.
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
- [ ] L-T5b: the editor on the new contract (rule editor's `when` as an expression field, `goto`, scene / experience
  rules in the Logic view and Inspector, `PUT …/logic`, `noteBehaviour`'s new `home` payload).

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
- [ ] Shop URLs for the book and the T-shirt (Tilman): both are `SHOP_URL_PLACEHOLDER` (https://buildingfictions.com)
  in `landing-config.ts`.
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
- [ ] The built-in browser pane blocks the local stage frame (`ERR_BLOCKED_BY_CLIENT`); the stage was checked in Chrome.
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
  - [ ] RULES #35 said no message from the stage frame makes the page call the API. A gizmo drag is such a message, and
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
  are sandboxed since 1.58.0 (#234); that question is closed.
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
- 2026-10-31 – plugin code in a sandbox: the editor's stage in an opaque-origin frame (#234) → `archive/MEMORY-2026-10.md`
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
