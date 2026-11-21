# The documentation site at /docs/

The documentation for the people who use the editor – editors, admins, plugin makers and people who connect an AI
agent – ships with the reader app as static pages (#336): `client/public/docs/`, served at **`/docs/`** like any file
of the site (`client/public/.htaccess` answers a folder with its `index.html`). It is written for users; the
developers' documentation stays here in `docs/*.md` (RULES #31). No build step, no framework, not in the service
worker's precache.

## What is where

```
client/public/docs/
  index.html              the hub: the three parts as cards
  docs.css  docs.js       the one stylesheet and the navigation
  img/                    the screenshots (WebP)
  guide/                  Editor guide – one folder per page (index.html)
    experiences/ workspace/ stage/ scenes/ inspector/ library/ logic/ code/
  tutorials/
    editor/  admin/       the short step-by-step tutorials
    index.html            the long walkthrough (content workflow, import, the demo – older, its own styles)
  api/                    Which API for what
    logic/ plugins/ mcp/  the guides, written by hand
    plugins/reference/    GENERATED – every member of the plugin API
    mcp/reference/        GENERATED – every tool of the MCP server with its parameters
    content/              GENERATED – the content model: types, parameters, ranges, defaults
```

| Part | Written from | Keep in step with |
|---|---|---|
| Editor guide | [editor](editor.md), [admin](admin.md) and the editor itself | a panel or a control that changes |
| Tutorials | the same, tried in the editor on the demo | the forms and buttons they name |
| API · logic | [content](content.md) "Behaviour" | the rule grammar (`shared/types/behaviour.ts`) |
| API · plugins | [plugins](plugins.md) | the plugin API version (`shared/types/plugins.ts`) |
| API · MCP | [mcp](mcp.md) | the tools (`mcp/src/`) |

The pages are brief on purpose: what a thing is for and how to use it, one screen per topic, a screenshot where it
shows more than a sentence. The whole story of a feature (why, how it is built, its edge cases) stays in `docs/*.md`.

## A page

Every page but the long walkthrough has the same frame: the stylesheet and script from `/docs/`, an empty
`<nav id="nav">` with the link home, then `<main>` with a kicker, the `h1`, a `.lead`, an empty `<nav id="toc">`, the
content and an empty `<footer id="pager">`. `docs.js` fills the three from **one list** (`PAGES`, in reading order):
the sidebar with the current page marked, *On this page* from the page's `h2[id]`s (three or more) and the previous /
next links. **A new page is a folder with an `index.html` and one line in `PAGES`** (the search reads that list too). Links are absolute (`/docs/…/`).

Building blocks of `docs.css`: `.beside` (text with a panel screenshot at its side, `.wide` for a wider one),
`figure` with `figcaption`, `.table` around a table, `ol.steps` (numbered tutorial steps), `.note`, `.cards` on the hub,
`kbd` for keys. **The look is the editor's** (Tilman, 2026-11-21: "style the docs in the way the creator and deck editor are
styled"): `editor/src/app.css`'s palette – monochrome, **day by default** (night only with `data-scheme="dark"` on `<html>`, and then in the reader's contrasts – black ground, white text, not the editor's greys) –, the system's type, square
corners, borders instead of shadows, labels in small capitals, hover only where a pointer hovers. No gold: that is the
reader's. The long walkthrough keeps its older, darker look until it is redone.

## Reference pages (generated)

Tilman, 2026-11-21: *"the apis should have reference pages. otherwise it is hard to find a specific one"* and
*"generated whenever anything in the apis updates"*. Three pages are written by generators from the code, never by
hand (each says so in a comment at its top); the guides link to them and the search finds every row.

| Page | Generator | Read from | Runs with |
|---|---|---|---|
| `/docs/api/plugins/reference/` | `editor/tools/docs-reference/plugin-api.mjs` | `editor/src/lib/plugins/plugin-api.d.ts` (the TypeScript compiler reads the interfaces, their members and their comments) | **`npm run plugin-api`** in `editor/` – the command that writes the declaration file from the engine writes the page in the same run, and its `--check` checks both; the editor build runs it too. `npm run docs-reference` writes the page alone |
| `/docs/api/mcp/reference/` | `mcp/scripts/docs-reference.mjs` | the tools as the server registers them: its register functions run against a recorder (no server started, no API asked), each zod schema becomes the parameter table | **`npm run docs-reference`** in `mcp/` |
| `/docs/api/content/` | `mcp/scripts/docs-model.mjs` (called by the same run) | `describeContentModel()` (`mcp/src/model.ts`, the contract in `shared/`) – what the tool `describe_content_model` answers | the same |

**They cannot go stale**: the Checks workflow fails when a committed page is not what the generator gives – *Plugin API
types and their reference page up to date* (job Editor) and *Tools reference page up to date* (job MCP server). So a
change of the plugin API, of a tool or of the content model comes with its page: run the command, commit the page.
The page frame and the helpers the generators share are `editor/tools/docs-reference/page.mjs`.

What a generator decides by hand is only the order: the plugin reference's sections (`SECTIONS` – a declaration the
file no longer has fails the run), the tools' groups (`GROUPS` – a tool no group names is listed under *Other* with a
warning, a group naming a tool that is gone fails) and the model's headings (`SECTIONS` in `docs-model.mjs` – a new key
of the model follows at the end). Every member, tool and parameter is a table row with an `id`, every type a heading
with one, so each can be linked and found.

## Search

A field at the top of the sidebar (`/` focuses it; ↑ ↓ and Enter pick; Esc clears). **No index file**: on its first use
`docs.js` reads the pages of its own list (`PAGES`) and collects what can be linked to – a page, a heading with an
`id`, a table row with an `id` – with the text that follows it. Every word of the query must be in an entry's title or
text; a title that is the query comes first, then one that starts with it, then one that holds it, then the text. So a
new page or a regenerated reference is searchable without any step, and a reference page's row (`api.vars.set()`,
`put_target`, `bloom`) is found by its name. While a query stands, its hits take the place of the page list.

## Screenshots

`img/*.webp`, taken from the local editor on the demo experience at 1440 × 900 in the day scheme – the whole window
for an overview, a panel cut out at its natural size (the Inspector is 400 px wide) where a panel is the subject.
They show test accounts only (`editor@osct.test`). Running the editor for screenshots: `agents/ORCHESTRATION.md`. When a
panel changes, retake its picture under the same name; a page names its image's `width` and `height`.

## In development

The reader's dev and preview servers answer a folder with the app's own page, so `client/vite.config.js` has a small
plugin (`docsIndex`) that gives a folder under `/docs/` its `index.html`: `http://localhost:5174/docs/` works with
`npm run dev:http` in `client/`. The editor links to the site from its account menu (*Documentation*, `TopBar.svelte`)
and from the import form (*How to bring an experience in*); on the editor's own dev server (5175) `/docs/` is not
served – it is the reader's.
