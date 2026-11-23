Status 2026-11-23: **decided** (Tilman, #352) and **built in 6.9.0** on `feature/352-plugin-files` (worktree
`osct-352`) for Tilman's review offline – not merged, not pushed. Draft: `agents/design/plugin-files.html` (frames `#tabs
#add #linked`, `?shot` hides the notes). How it was built: "Built (6.9.0)" at the end.

# Plugins with more than one file – file tabs in the Code tab

Tilman, 2026-11-23 (from #350, parked): *"for a plugin do we have an option to have more than one file belong to one
plugin?"* · *"i almost feel like people should handle plugin development themselves."* · in the debate: *"folders in the
tab have one advantage. they allow us to see what a plugin is made of. exactly, and download would make them
distributable. our osct tool helps to build when in an IDE and we can link and upload easily to preview etc. problem is
the build step. and the type check a wasm worker wouldnt fix this?"* · *"no file tree. just file tabs. like shader toy.
shaders and other related code files can also appear there and you must have a + to add a file to the plugin"* · on
the Library's shaders: *"Keep both"* · on the remaining eight points: *"yes"*.

## Where things stood (measured 2026-11-23, 6.5.0)

- **Content build** (`scripts/src/build/plugins.ts`, `bundlePlugin`): `plugins/<id>/index.ts` and its siblings, bundled
  by esbuild 0.25 (no bare imports), type-checked, run once to record what it registers; warns above 256 KB.
- **Code tab** (`editor/src/lib/panels/CodePanel.svelte`): one source per plugin in one Monaco buffer, the picker, *new*,
  Delete · Download · Run · Save; transpiled by sucrase (`plugins/compile.ts`), which refuses any import – so no
  siblings. Publish carries the transpiled sources (`publish-plugins.ts`), no type check, no bundling (#266).
  Monaco's TypeScript worker already has the plugin API's and three's types (`plugins/monaco.ts`).
- **Storage**: `plugins` table, one `source` per id, 256 KB each (413). `upload_plugin` / the Library's drop take a
  `.ts` or `.js` file as a source; `put_plugin` saves text. The export file's `sources` = `[{ id, source }]`.
- **Shaders**: Library files (`.glsl/.frag/.vert/.wgsl`, 256 KB), loaded with `api.loadText(url)`; the Library counts
  the sources that name a URL, refuses Delete while used, *Replace…* rewrites the URL. A layer's GLSL can't use them
  (needed at `register` time).
- **A trap today**: a plugin the content build compiled opens in the Code tab from its `index.ts` alone
  (`plugins.svelte.ts` `declaredSource`); Save makes that file a stored source, and a sibling import then fails at Run
  and Publish (*"A plugin imports nothing"*). The demo dodges it: the aquarium is 92 KB in one file, `fluid` a plugin
  of its own.

## The options debated

- **A.** Several files in the Code tab, bundled in the browser.
- **B.** Bring your own plugin: `osct plugin build` makes a bundle, the editor takes it read-only with a version.
- **C.** Both.

I first recommended C (B for anything multi-file, the Code tab stays one file): B was two thirds there (`.js` upload).
Tilman's point turned it: files in the tab show **what a plugin is made of**, and Download makes them **distributable**;
the CLI links an IDE to the editor for preview. The two objections to A fall away:
- **The build step**: esbuild-wasm in a worker (a few MB over the wire, loaded with the first Run of a plugin with more
  than one file, cached). A plugin imports nothing but its own siblings and types – no npm resolution, a virtual file
  system of its files is the whole job. The same esbuild version as `scripts/` → the same bundle on both sides.
- **The type check**: no new wasm – Monaco's TypeScript worker (`getTypeScriptWorker`) gives every file's semantic
  diagnostics.

Opaque uploaded bundles (B's read-only plugins) are not needed: without npm imports a bundle never holds anything the
folder can't.

## The decision

**A plugin is a folder of files, everywhere** – the content source (`plugins/<id>/`), the editor, the export, the
download. The files are the truth; a bundle is only ever made from them.

1. **File tabs, no tree** – Shadertoy's way. One tab per file, `index.ts` first (the entry: can't be closed or
   renamed); the others × on hover, double-click renames. **Closing a tab deletes the file** (Tilman: *"closing a file
   tab is deleting i assume"* – yes: every file of a plugin is always a tab, there is no closed-but-kept). It is an
   unsaved edit like any other – the plugin gets its asterisk, Save makes it stick, leaving without saving brings the
   file back – and the change log keeps the saved files before, so a revert restores it. No confirm dialog. A file
   another file imports is still closed, and the next Run names the broken import. The tabs scroll sideways under a **+** fixed
   at the right edge. **+** offers TypeScript `.ts`, fragment `.frag`, vertex `.vert`, GLSL include `.glsl`, WGSL `.wgsl`
   and *Upload files…* (or a drop on the tabs).
2. **Shaders: both.** A shader in the plugin's tabs is its own, imported as a string (`import WATER from "./water.frag"`
   – esbuild's text loader; works for a layer's GLSL too). The Library keeps shaders several plugins share
   (`api.loadText`, its uses count, Replace… as today).
3. **Export and import carry the sources**: each plugin `{ id, files: [{ name, text }] }` in place of `{ id, source }`.
   (Built: the export file's `formatVersion` 2 – no content schema MAJOR was needed, the configuration's `plugins` list
   is unchanged; content schema 6.1 only for the file rules in `shared/`. Stored sources need no migration: `source`
   stays the `index.ts`.)
   The bundle doesn't travel: a published version holds its `plugin-<hash>.js`, an import rebuilds from the files.
4. **The Code tab's files are the truth.** The CLI links an IDE folder: `osct plugin link <experience> <id>`, then
   `push` / `pull` – just another way to save them; every push runs on the stage. The content build bundles the same
   folder with the same esbuild version.
5. **Who may replace**: whoever may edit the experience, as now. Every save is a change (who, when); the plugin guard
   (#340) asks before running code someone else saved. A linked plugin is not locked – the later save wins, as with
   every save; the Code tab shows a strip *linked · ben's folder, pushed 2 min ago · Unlink*.
6. **Versions**: none of our own. The change log is the history, the published module carries its hash; semver, if a
   developer wants it, lives in their repository.
7. **Sizes**: 256 KB per file stays a hard limit; the 256 KB **warning** moves to the bundle – in the status line
   (*4 files, 31 KB bundled*) and at Publish, like the content build's; 1 MB per plugin in all is a hard limit.
8. **Type check at Publish**: Monaco's worker checks every file of every plugin; a type error stops the Publish with its
   file and line, as the content build does. That settles the type-check half of #266; whether the server compiles
   instead stays there.
9. **Download** = the folder as a zip with `plugin-api.d.ts` and `tsconfig.json` (as now, with all files); a zip like that
   dropped on the Code tab or the Library becomes a plugin – that is how plugins are passed on.
10. **The trap** (above) goes away: a plugin from the content build opens with all its files.

## What it touches (for the build issue, not estimated)

- `server/`: the `plugins` table → files per plugin (a `plugin_files` table or a JSON column), the endpoints
  (`GET/PUT …/plugins/{pid}` with `files`, a file upload into a plugin, the zip), the export file's `sources`, the
  import, the change log's `kind: plugin` before / after, the Library's *uses* reading every file, the 1 MB cap; a
  migration.
- `editor/`: the tab row and + menu in `CodePanel.svelte`, a Monaco model per file (`file:///plugins/<id>/<name>`, so
  imports between them type-check), esbuild-wasm in a worker for Run and Publish (sucrase kept for one-file plugins
  or replaced), the type check at Publish, the bundle size, Download / drop of a zip, the linked strip.
- `scripts/`: `osct plugin link / push / pull`; the content build's text loader for shader files; the same esbuild
  version pinned for the editor.
- `mcp/`: `get_plugin` / `put_plugin` / `upload_plugin` with files; `osct://guides/plugins`.
- `shared/`: the API types, the export format; schema MAJOR.
- `docs/plugins.md` ("Shipping it", "A shader file", the rules of the road), `docs/editor.md` "Code", `docs/server.md`
  "Plugin sources" and "Export file".
- The demo: the aquarium split (`fluid`, its shaders) as the example.

## Still open

- Whether a GLSL include (`.glsl`) can `#include` another tab, or only be imported as a string into TypeScript and
  joined there – decide when building (esbuild only does the latter).
- Whether sucrase stays for one-file plugins (no wasm at all for small plugins) or esbuild-wasm does every Run.

## Built (6.9.0, 2026-11-23)

Tilman: *"built this locally and let me review it offline"*. On `feature/352-plugin-files` (develop merged in, 6.8.0 →
6.9.0), every suite green; checked in the running editor against the worktree's own API and database.

- **Server** (`Plugins.php`): `source` stays the `index.ts`, `files_json` the other files, `origin_json` the link
  (`ALTER TABLE … ADD COLUMN`, `Db::migrate`); the API answers `files`, `PUT` takes `files` or `source` and `origin`;
  `Plugins::texts` for registers and the Library's uses, `Plugins::replaceText` for Replace…; the export file format 2,
  the archive writes every file; the import takes `{ id, files }` (and `{ id, source }`).
- **Editor**: `CodePanel.svelte` – tabs, + menu, rename (double-click, F2), × deletes, drops, a zip → a new plugin, the
  linked strip, the bundle size; `plugins/bundle.ts` – one file through sucrase, several through esbuild-wasm 0.25.2
  (the content build's esbuild pinned to the same); `monaco.ts` – a model per file, the shader imports' types,
  `typeCheckPlugins` for Publish; `publish-plugins.ts` – type check, then bundle, the 256 KB warning; the Library takes a
  plugin's zip and lists a plugin of several files as its folder; make it code copies a plugin's other files along.
- **Content build**: shader files through esbuild's `text` loader, `shared/types/plugin-shader-files.d.ts` in the type
  check, the files' rules as errors, `files.json` next to `plugin.js` (the Code tab opens a compiled plugin with all its
  files – the trap is gone).
- **CLI**: `osct plugin link / push [--watch] [--force] / pull` (`scripts/src/lib/plugin-link.ts`); push type-checks
  first; `osct plugins listen` rewrites every `.ts` of a plugin.
- **MCP**: `get_plugin` / `put_plugin` with files (or `source`), `list_plugins` with `fileCount` and `origin`.

Decided while building (*mine*, to review):
- A one-file plugin keeps sucrase (no wasm for small plugins) – the second open point above.
- `.glsl` is a file imported as a string like the others; no `#include` between tabs.
- Unlink sends the *stored* files back with `origin: null`, so unsaved edits stay edits.
- The editor still reads an export file of format 1 (one line) – an export on someone's disk keeps working.
- The demo's aquarium is **not** split yet: `fixtures/demo` is staging's export, splitting it is content work on staging.
