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

## Open for Tilman

- C (Scutoons monorepo, editor.scutoons.com), or B (a Svelte app inside the OSCT repo and image)?
- Who signs in: a Scutoons member with an instance token (the bridge), or an OSCT editor account?
- Does the reader's vanilla `/editor` stay as the on-device quick tool after the Svelte editor exists, or go?
- The name: `editor` in the monorepo, or something that says AR (`stage`, `animus`)?
