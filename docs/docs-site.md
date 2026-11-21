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
    logic/ plugins/ mcp/
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
next links. **A new page is a folder with an `index.html` and one line in `PAGES`.** Links are absolute (`/docs/…/`).

Building blocks of `docs.css`: `.beside` (text with a panel screenshot at its side, `.wide` for a wider one),
`figure` with `figcaption`, `.table` around a table, `ol.steps` (numbered tutorial steps), `.note`, `.cards` on the hub,
`kbd` for keys. **The look is the editor's** (Tilman, 2026-11-21: "style the docs in the way the creator and deck editor are
styled"): `editor/src/app.css`'s palette – monochrome, day and night following the system –, the system's type, square
corners, borders instead of shadows, labels in small capitals, hover only where a pointer hovers. No gold: that is the
reader's. The long walkthrough keeps its older, darker look until it is redone.

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
