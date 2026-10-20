# Content editor – requirements and evaluation (research, 2026-10-02)

Question (Tilman): what would a fairly standalone editor for OSCT need – content meta and asset management,
a 3D editor for the target scenes, anything else already in the feature set – reusable for later projects with
the same or a similar architecture? And would it really save time compared to asking Claude Code for changes?

**Abandoned for now (Tilman, 2026-10-02):** content changes stay with Claude Code. Kept as reference. Not part of `PLAN.md`.

## 1. What the editor would have to cover (from the current feature set)

The content model today (`docs/content.md`, `shared/types/`, `scripts/src/lib/schema.ts`):

| Area | What exists | Editor needs |
|---|---|---|
| **Book** | `book.yaml`: id, title, author, publisher | Form. The id must never change after release. |
| **Spreads** | `spread.yaml`: title, order, firstPage, lastPage; no overlaps; every entry's page inside one | Form + a **page map of the book** (spreads as ranges, entries/targets on their pages, gaps and overlaps shown). |
| **Entries** | category (glossary/video/text/link), title, page, body, author, image, media, tags, optional `target` | Category-dependent form, Markdown-ish body, image picker, link preview (YouTube/Vimeo embed). |
| **Targets** | image (as printed, cropped), optional entity; **max 10 per spread** (`MAX_TARGETS_PER_SPREAD`) | Image upload + crop, counter per spread, **trackability check** (detail/contrast; tiny or flat images are found late – MEMORY 2026-09-28), duplicate-image check (four demo targets were duplicates). |
| **Entities** | inline or shared (`entities/<id>/entity.yaml`, `ref`); types model / video / image (extensible, RULES #7) | Type picker, asset slot per type, "used by" list for shared entities. |
| **Placement** | `params`: position (target widths), rotation (degrees, XYZ), scale; defaults per type (`shared/types/placement.ts`) | **The 3D part:** target image as a plane, entity on it, move/rotate/scale gizmo, writes `params`. |
| **Video filters** | `filters: [chromaKey …]`, spec with kind/default/range in `shared/types/filters.ts` | Sliders generated from the spec, live keyed preview on the real shader. |
| **Onboarding steps** | `step.yaml`: index, title, description, footer, button, action, illustration, advance, fadeIn, stagger; `{{title}}` etc. | Ordered list, form, timing preview. |
| **Media** | allowed types; GLB optimised by the build (1024 px textures, meshopt); video 720p H.264 ~2 Mbit/s | Size/format report per file, warnings above the targets (mobile data), GLB stats (polygons, textures, animations). |
| **Validation** | build collects every problem, names file + field (RULES #16) | Run the same checks live, show problems next to the field. |
| **Build + versioning** | `npm run build:content`, committed `game.config.json`, one version for app/build/server, CHANGELOG (RULES #10, #23), CI checks the config matches | Build button, diff view, commit – or leave this to git/Claude. |
| **Ids** | folder name = id, progress stored by id | Warn on rename; rename = new entry for readers. |
| Later | Look-around world (`world:` in book/spread, PLAN Phase 10), sounds (app files, not content), tags/filters | Keep the editor schema-driven so new fields don't need new UI code. |

Missing from the model if "3D editor to create the target scenes" means **several objects per target**
(composition, animation timing, triggers): today a target has **one** entity. A scene editor implies a
content-model change first (scene graph per target) – a decision with Kévin, not an editor feature.
3D modelling itself stays in Blender etc. (GLB in, placement out).

## 2. Architecture for reuse

- **Files stay the source of truth** (YAML + media in git). The editor is a local tool (vite page + small
  Node file API), no database. Git is the history and the undo; Claude Code and the editor can work on the
  same files.
- **Schema-driven forms.** `shared/types/filters.ts` already describes parameters with kind/default/range;
  extend that pattern to every content field (one descriptor per content type). The build's checks, the
  app's guards and the editor's forms all read it – so a model change touches one place instead of three.
  This is the precondition for reuse; without it the editor needs code changes with every model change.
- **Project adapter** for other projects: content root, schema descriptors, build command, and a preview
  plugin. Everything OSCT-specific (spreads, page map) lives in the adapter.
- **Preview = the app's own code.** The tracker is behind `IImageTracker` and entities go through the
  registry (`ar/entities.ts`): a fake tracker that reports a fixed pose for the target image renders
  exactly what the phone renders (placement defaults, chroma key, celebration). three.js `TransformControls`
  for the gizmo. Don't write a second renderer.
- **On-device tuning** is the other half: the real check is the phone over the printed page (lighting,
  tracking, scale). The look-around already has live tuning over USB (`window.osctLookAround`); the debug
  overlay could do the same for the found target's entity and copy the YAML.

Existing tools checked:
- Git-based CMS for the YAML forms: Sveltia CMS (successor of Netlify/Decap CMS, no backend, config in
  YAML, public beta) – covers forms and media upload, not the nested target/entity/placement editing or the
  AR preview. Possible for meta only.
- Hosted WebAR editors (Zappar Mattercraft, Kivicube, …) bring their own engine and hosting – would replace
  the stack (RULES "do not swap"). Not an option. 8th Wall's own studio is gone (shutdown 2026).

## 3. Would it save time? (Tilman with Claude Code vs. an editor)

| Kind of change | With Claude Code today | With an editor | Verdict |
|---|---|---|---|
| Text / meta (title, body, page, tags) | ~1 min, one prompt, Claude also builds, bumps, commits | ~1 min | **No gain** for Tilman. |
| Bulk content (import 30 targets from a PDF, rename, restructure) | Claude did this in one session (demo spreads 4–14) | Manual per item, or needs an import feature | **Claude wins.** |
| Content-model changes (new field, new entity type) | Claude changes schema, guards, build, app, docs | Editor must change too (maintenance) | **Editor costs time** – the model changed several times in a week (1d, 1e, filters, 1.3.2). |
| **Placement** of a model/video on a page | Guess numbers → build → reload phone → look → describe → repeat; ~3–5 min per round, 5–10 rounds | Drag the gizmo, see it; final check on the phone | **Big gain:** ~30–45 min → ~5 min per object. |
| **Chroma key** tuning | Same loop, numbers in steps of 0.02 | Sliders on the live video | **Big gain.** |
| Target image quality | Find out on the phone | Score / warning on upload | Gain (fewer wasted print/test rounds). |
| Kévin or designers editing alone (Amsterdam) | Needs Tilman + Claude for every change | Independent | **Gain in people, not minutes** – only if they will actually edit. |

Rough numbers: with ~15–20 targets carrying AR content in the final book and ~2 tuning passes each, the
visual tuning loop costs **~15–25 hours** with Claude alone vs. **~3–5 hours** with a live preview. Meta
editing gains close to nothing.

Rough build costs (Claude writing the code, Tilman reviewing/testing):

| Option | Scope | Effort |
|---|---|---|
| **A. On-device tune panel** | Debug overlay: gizmo/sliders for the found target's placement and filters, "copy YAML" (or write back to the dev server) | 1–2 days |
| **B. Desktop preview page** | Pick an entry → target image + entity rendered by the app's code, gizmo, sliders, writes `params`/`filters` to the YAML via the dev server, live rebuild | 3–5 days |
| **C. Content meta editor** | Schema-driven forms for all content types, media upload + report, live validation, page map | 1–2 weeks (+ schema-descriptor refactor of build/guards) |
| **D. Standalone reusable editor** | C + B as a separate package with project adapters, packaging, docs, tests | +2–4 weeks, plus upkeep with every model change |

## 4. Recommendation

- Don't build the standalone editor (D) now. There is one project using this architecture; the right moment
  to extract a reusable tool is when a second one exists and the content model has settled after Phase 14.
- The time is saved in the **visual tuning loop**, not in forms. Build **A** (and possibly **B**) before the
  Amsterdam content session – that is where most of the tuning will happen.
- If an editor comes later, prepare it cheaply now: move field descriptions to schema descriptors (the
  `filters.ts` pattern) when the build or guards are touched anyway.
- Decide with Kévin whether he/the designers will edit content themselves. If yes, C (or Sveltia for meta)
  becomes worth it; if Tilman stays the only editor, Claude Code covers meta editing.

Sources: [Sveltia CMS](https://github.com/sveltia/sveltia-cms) ·
[Mattercraft for 8th Wall developers](https://zap.works/mattercraft-for-8th-wall-studio-developers/) ·
[Alternatives after 8th Wall's shutdown](https://www.kivicube.com/blog/?p=19060)
