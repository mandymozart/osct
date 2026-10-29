# Svelte for the editor? Where the editor lives (concept for #61)

2026-10-29, for Tilman's decision. Tilman: "der Editor ist meines Erachtens die Bridge. Für den Viewer ist es gut, so
klein wie möglich zu sein. Der Editor kann von Svelte, Performance und State Management profitieren." Today the editor
is a vanilla web-component chunk inside the reader (`client/src/editor/`, PR #62): it lives in the reader's build,
follows the Scutoons UI dogma by hand, and reuses nothing of `@scutoons/ui`. This note weighs three places for a
Svelte editor and recommends one.

## Short answer

- **The reader stays vanilla and small** (RULES Stack) – nothing here changes that. Every option keeps the AR scene,
  the mock stage and the preview contract (`ar-bridges/utils/preview.ts`, `TUNE_ENTITY_EVENT`) in the reader; the
  editor UI moves out of it.
- **Recommendation: C – the editor as an app in the Scutoons monorepo**, `scutoons/editor` (working name; deployed as
  editor.scutoons.com), built with `@scutoons/ui` and `@scutoons/tokens` as the creator is. The OSCT reader gets a
  **stage route** (`/stage`, the editor page without its sheet) that the editor embeds and drives, and the instance's
  API (`/api/editor/*`, step 2) that the editor saves to. That is the bridge Tilman means: one editor for every
  instance of the core, the instance keeps its data (STRATEGY: data sovereignty, instances per brand), the UI kit is
  reused as source, not copied.
- **Why not Svelte inside the reader's chunk (A)**: `@scutoons/ui` is a private source package of the monorepo
  (Svelte 5.55, SvelteKit 2.55, "no publishing, no dist folders" – PLATFORM.md) and assumes its page frame
  (`AppShell`, `ActionBar`, `tools.css` on the app root, the fluid root size). Inside the reader's shadow-DOM pages it
  would have to be published first and would fight the reader's CSS; we would end up re-building the dogma by hand
  again, only in Svelte. A gives Svelte's state management, not the kit.
- **Why not a second SvelteKit app in the OSCT repo (B)**: the same publishing problem for the kit (GitHub Packages
  with a token in CI and the Docker build, or a git subtree that drifts), and a second deploy per instance – every
  brand would ship its own editor. C ships one.
- **Cost to reach today's editor again in C**: the stage API in the reader ~1 day, the Svelte app with the Stage and
  Entity panels ~2–3 days (most of it is the kit's components), auth and CORS come with step 2 anyway. The vanilla
  sheet stays on staging until the Svelte editor does what it does, then it goes (RULES #1: with Tilman's okay) and
  the reader is smaller again.

## The three places

| | A · Svelte in the reader's editor chunk | B · SvelteKit app in the OSCT repo | C · app in the Scutoons monorepo |
|---|---|---|---|
| Reuse of `@scutoons/ui` / tokens | no (private, unpublished) – or publish first | after publishing (GitHub Packages) or a git subtree | **yes, as source**, like creator / admin |
| Reader size | editor chunk grows by Svelte's runtime (~15 kB gz), nothing on the start path | unchanged | unchanged |
| Page frame, docking, ActionBar, InfoPanel, palette | hand-made | the kit's, once published | **the kit's** |
| Talks to the stage | in-process (today's contract) | same origin: iframe + direct window API | cross origin: iframe + `postMessage` |
| Saves to | the instance's API | the instance's API | the instance's API (CORS, editor token) |
| Deploy | with the reader | a second build in the OSCT image (`/editor`) | **one editor for all instances**, Scutoons' deploy |
| Who signs in | OSCT account | OSCT account | Scutoons member + an instance token (decide) |
| Fits the strategy | OSCT tool | OSCT tool | **the bridge**: the core's editor |
| Effort to parity | ~1 day | ~3 days + publishing | ~3–4 days |

## What the reader exposes (every option needs it; C needs it first)

- **`/stage`** – a route that is today's editor page without the sheet: scan mode, the preview active, the mock
  stage, the debug line off. Its parameter is the spread (`/stage/s004-005`). Nothing else of the reader's chrome
  (no header, no spread menu) – the embedding editor owns the frame.
- **The stage protocol** (`client/src/components/ar-bridges/utils/stage-api.ts`, three-free, main chunk): the
  commands the editor sends and the state the stage reports, usable in-process (A), through the iframe's window
  (B, same origin) or as `postMessage` (C). Versioned like the preview settings.

  | Editor → stage | Stage → editor |
  |---|---|
  | `setSpread(spreadId)` | `state`: spread, targets with found / hidden, preview (view, orbit, backdrop, wobble), tuned entities |
  | `setPreview(patch)` (view, orbit, backdrop, photo, wobble) | `tapped(targetId)` – the editor decides what a tap does (open the entry's form, not the reader's page) |
  | `setHidden(targetId, hidden)` · `replayUnlock()` | `ready` / `error` |
  | `tune(targetId, entity \| null)` (today's `TUNE_ENTITY_EVENT`) | `content`: the loaded configuration's version, so the editor knows which draft the stage shows |
  | `loadContent(url)` – the draft as a game configuration (step 2: `?content=draft`) | |

- In C the stage iframe is cross origin (editor.scutoons.com → osct.buildingfictions.com): `postMessage` with an
  origin check on both sides, the editor's origin configured per instance (`OSCT_EDITOR_ORIGIN`), the same list the
  API's CORS uses.
- The reader's own `/editor` (the vanilla sheet) keeps working on top of the same protocol until it is retired.

## The Svelte editor (C), first version

- `scutoons/editor` as a workspace app like `creator/`: SvelteKit static, `@scutoons/ui` + tokens, `sc-tool`,
  `AppShell` in `mode="fill"`: the stage iframe is the content, the right dock holds the inspector panels (**Stage**:
  view, found, shake, backdrop as `PropRow`s with `Segmented` and `ScrubNumber`; **Entity**: placement and filters –
  the kit's `ScrubNumber`, `Segmented`, `ColorField`, `FieldReset`, `LinkedPair` for an even scale), the `ActionBar`
  at the bottom (spread ‹ ›, later Save · History · Publish · More, icons only), `InfoPanel` with the page's help,
  the `CommandPalette`. On a phone the inspector is the sheet whose head is its tab row – exactly the pattern the
  vanilla sheet imitates today, now the real thing.
- **State**: Svelte 5 runes stores for the draft (entities per target, dirty flags, undo / redo as a history of
  patches – the kit's History pattern), the stage's reported state as a readable; the content model and its checks
  from `@osct/shared`? No: from the instance's API (`GET /api/editor/schema` – the specs that drive the inspector,
  the entity concept's `specs.ts`). The editor must not depend on an OSCT package: every instance may run another
  version of the core; the specs come over the wire with the draft.
- **Instances**: the editor opens an instance by URL (`editor.scutoons.com/#/osct.buildingfictions.com/s004-005`),
  reads its `/api/editor/instance` (name, brand tokens for the stage's chrome? no – the stage brings its own look,
  the editor stays neutral), signs in, lists spreads.
- **Auth** (decide): a Scutoons member who holds an *instance token* issued by the instance's admin (OSCT's accounts
  API gets an `editor_tokens` table), or an OSCT account with an editor role (`book_editors` in the data model). The
  token travels as a bearer header to the instance's API; the stage iframe needs none (it shows the published or the
  draft content by URL).

## Steps

1. **Stage route and protocol in the reader** (this branch or the next, 1.10.x): `/stage`, `stage-api.ts`, the
   vanilla sheet switched onto the protocol (it becomes the protocol's first client and test).
2. **`scutoons/editor` skeleton**: the app, the stage iframe, Stage and Entity panels on the kit, reading the
   published content of an instance – parity with today's `/editor`.
3. **Step 2 of #61 as planned**, but with the API's consumer being the Svelte editor: `/api/editor/*`, CORS and the
   token, the draft as a game configuration, publish to staging.
4. Retire the reader's `/editor` sheet (ask), keep `/stage`.

## Decided (Tilman, 2026-10-29, right after reading)

- **Who signs in: an OSCT instance user** ("also ein OSCT-Instanzen-User") – the accounts API's users with an editor
  role (`book_editors` in the data model), no Scutoons member, no instance token.
- **Independent of Scutoons for now** ("das Ding ist Scutoons-unabhängig im Moment") – so not C. The editor stays in
  the OSCT repository; the Scutoons dogma is followed, its kit is not a dependency (it is unpublished anyway). The
  bridge to Scutoons stays a direction, not a build step.
- Still open: **A** (Svelte inside the reader's lazily loaded editor chunk – one build, one deploy, the stage in
  process) or **B** (a SvelteKit app in the OSCT repo, served at `/editor` from the same image – a second build, the
  stage through an iframe on the same origin). With the kit out of the picture the difference is tooling, not UI:
  A adds `@sveltejs/vite-plugin-svelte` to the reader's build but nothing to the reader's start path; B keeps the
  reader's build Svelte-free and gives the editor its own routes and page frame. Recommendation now: **A** – the stage
  protocol is built in both cases, and A reaches parity with today's sheet in about a day; B when the editor outgrows
  a chunk (forms for every entry, history, the database step).
- Whether the vanilla `/editor` sheet stays as the on-device quick tool, and the name, stay open.
- Then: "Und OSCT wird das nie. Das ist für Building Fictions im Moment" – the instance is **Building Fictions**, the
  brand; OSCT is a title inside it. The editor belongs to the instance, not to the book: its users are the brand's,
  its API the instance's. And: "Der Editor erstmal im OSCT-Repo" – it is built here (A or B), not in another repository.

## The boundary (proposal, 2026-10-29 evening – Tilman decides)

Tilman: "Das ist die Frage des Routings – wer für was verantwortlich ist. Der Editor hat eine Sonderstellung: er
braucht die Engine nur für ein Preview, der Rest ist simuliert. Daher muss da eine Grenze her."

The boundary is a route and a protocol, nothing else:

| | Reader (the engine side) | Editor (the tool side) |
|---|---|---|
| Owns the routes | `/`, `/spread`, `/entry`, … and **`/stage`** – the one route an editor uses | **`/editor/*`** – its own router (sign-in, book, spread, entry, target, entity, history, publish) |
| Runs | three.js, 8th Wall or the mock tracker, the mock stage, the preview – **only inside `/stage`** | no engine at all: forms, lists, the 2D spread map (page image + target boxes, simulated), state, history |
| Knows about | the content it is given (published, or a draft by URL: `/stage?content=<url>`) | users, drafts, the database, versions, the compile step, publishing |
| Talks | the stage protocol: commands in, state / tapped / ready out (`stage-api.ts`) | embeds `/stage` in an iframe when the author wants the 3D preview; drives it through the protocol |
| Build and deploy | the reader's Vite build, as today | a SvelteKit app built in the same image, served at `/editor` (B) |
| Server | `/content/*` (CDN) as today | `/api/editor/*` on the accounts API: drafts, publish, compile job |

Consequences:
- The reader stays a reader: `/stage` is the editor page without a sheet, no account, no draft logic. If someone
  opens it by hand they see the mock stage with the published content – harmless.
- The editor can work without the engine: the spread map (the sheet image from the layout, the targets as boxes,
  drag to move / resize – the "rest is simulated") is where most editing happens; the iframe is the preview the
  author opens when they want to see it in 3D. On a phone the iframe fills the screen and the editor is the sheet.
- `/editor` moves out of the reader's router (the vanilla sheet goes when the Svelte editor reaches parity; the
  debug overlay's `editor` button then opens `/editor/` the app). The reader's router no longer knows an editor.
- The compile step is the content build (`scripts/`) run by the server on publish: draft rows → game configuration
  + plugin bundle → a content version on the CDN; staging first.

Packages to push through once decided (Tilman: "schlafen und durchziehen – bis Ende aller Pakete: Datenbank,
Editor, Compilieren, Ausliefern"):
1. `/stage` + protocol in the reader (this branch).
2. Database: the editor tables (data-model note), `/api/editor/*` (read book, spreads, targets, entities; save
   entity drafts; publish).
3. Editor: the SvelteKit app at `/editor` – sign-in (instance user), spread map, Stage / Entity panels on the stage
   iframe, save.
4. Compile: publish runs the content build from the database on the server → a new content version.
5. Deliver: the image builds reader + editor, Kamal deploys to staging; the editor reachable at
   osct.porschuetz.de/editor.
