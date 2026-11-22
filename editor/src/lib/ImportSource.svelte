<script lang="ts" module>
  import type { ImportPreview, ImportSource } from "#lib/api.js";

  /** A source read and previewed: what the server said, where from, and the body that imports exactly it */
  export interface LoadedSource {
    key: string;
    preview: ImportPreview;
    from: string | null;
    /** What to send to the import (with `rename` / `title` / `create` / `confirm` added by the flow) */
    body: ImportSource;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { previewImport } from "#lib/api.js";
  import { contentBaseOf, previewRows, readConfiguration, readContentBase, sourceErrorLine } from "#lib/import-preview.js";
  import { readImportFile } from "#lib/experiences-page.js";

  /**
   * Where an import comes from (#348 – the New flow's *From an export* and a book's *Replace…*), the one place the editor
   * reads a source: **File** (an export file – `GET …/export/file`, the import body it is – or a bare game.config.json),
   * **URL** (a game.config.json, or a content base: a CDN folder with latest.json) or **Published** (the current version of
   * an experience on this instance's CDN – the server reads its store). It previews what comes in (`POST
   * /editor/import/preview`, with `into` when the import goes to another experience) and hands the body that imports
   * exactly what was previewed to `onloaded`. The fields' explanations are their Info view help.
   */
  let { published, into = null, initial = "file", onloaded }: {
    /** The experiences published on this instance's environment (Published picks one) */
    published: readonly { id: string; title: string }[];
    /** The experience the import goes to (`rename`) – the preview compares with it */
    into?: string | null;
    initial?: "file" | "url" | "cdn";
    onloaded: (loaded: LoadedSource | null) => void;
  } = $props();

  // Only on a developer's machine is the reader's dev server next door (port 5174, its bundled configuration)
  const local = typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const readerGuess = local ? `${location.protocol}//${location.hostname}:5174` : "";
  // svelte-ignore state_referenced_locally
  let mode = $state<"file" | "url" | "cdn">(initial);
  let url = $state(local ? `${readerGuess}/src/game.config.json` : "");
  let assetsBase = $state(readerGuess);
  let file = $state<File | null>(null);
  // svelte-ignore state_referenced_locally
  let experience = $state<string>(into && published.some(p => p.id === into) ? into : (published[0]?.id ?? ""));

  type Read = LoadedSource & { kind: "export" | "configuration" | "cdn"; versionFolder?: string; exportOf?: string };
  let loaded = $state<Read | null>(null);
  let previewing = $state<string | null>(null);
  let failed = $state<{ key: string; message: string; url: string | null } | null>(null);

  const key = $derived.by((): string | null => {
    if (mode === "cdn") return experience ? `cdn ${experience}` : null;
    if (mode === "url") return /^https?:\/\/\S+$/i.test(url.trim()) ? `url ${url.trim()} ${assetsBase.trim()}` : null;
    return file ? `file ${file.name} ${file.size} ${file.lastModified} ${assetsBase.trim()}` : null;
  });
  const current = $derived(loaded && loaded.key === key ? loaded : null);
  const problem = $derived(failed && failed.key === key ? failed : null);
  /** The assets base field matters only for a bare configuration: an export file and the CDN bring their own */
  const needsAssets = $derived(mode !== "cdn" && !(current?.kind === "export"));

  const fieldBase = (fallback?: string): string | undefined => {
    const field = assetsBase.trim().replace(/\/+$/, "");
    if (fallback && (!field || field === readerGuess)) return fallback;
    return field || undefined;
  };

  const read = async (forKey: string): Promise<Read> => {
    const intoPart = into ? { into } : {};
    if (mode === "cdn") {
      const body = { source: "cdn" as const, experience };
      const preview = await previewImport({ ...body, ...intoPart });
      return { key: forKey, kind: "cdn", preview, from: preview.contentBase, body };
    }
    if (mode === "url") {
      const contentBase = contentBaseOf(url);
      if (contentBase) {
        const got = await readContentBase(contentBase);
        const body = { configuration: got.configuration, assetsBase: fieldBase(got.versionFolder) };
        const preview = await previewImport({ ...body, ...intoPart });
        return { key: forKey, kind: "configuration", preview: { ...preview, contentBase, manifest: got.manifest }, from: contentBase, body, versionFolder: got.versionFolder };
      }
      const configuration = await readConfiguration(url.trim());
      const body = { configuration, assetsBase: fieldBase() };
      return { key: forKey, kind: "configuration", preview: await previewImport({ ...body, ...intoPart }), from: url.trim(), body };
    }
    if (!file) throw new Error("Choose a file.");
    const got = readImportFile(file.name, await file.text());
    if (got.kind === "export") {
      const body = { configuration: got.configuration, files: got.files, ...(got.assetsBase ? { assetsBase: got.assetsBase } : {}), ...(got.sources.length ? { sources: got.sources } : {}) };
      const preview = await previewImport({ ...body, ...intoPart });
      return { key: forKey, kind: "export", preview, from: file.name, body, exportOf: `${got.of.title || got.of.experience} · build ${got.of.build}` };
    }
    const body = { configuration: got.configuration, assetsBase: fieldBase() };
    return { key: forKey, kind: "configuration", preview: await previewImport({ ...body, ...intoPart }), from: file.name, body };
  };

  const load = async (forKey: string) => {
    previewing = forKey;
    try {
      const result = await read(forKey);
      if (key === forKey) {
        loaded = result;
        failed = null;
        // The flow learns what is ready to import
        onloaded({ key: result.key, preview: result.preview, from: result.from, body: result.body });
      }
    } catch (e) {
      if (key === forKey) failed = { key: forKey, ...sourceErrorLine(e) };
    } finally {
      if (previewing === forKey) previewing = null;
    }
  };

  // The preview follows the source: Published at once, a URL once typing pauses, a file when chosen
  $effect(() => {
    const forKey = key;
    if (loaded?.key === forKey) return;
    // …and nothing while the source changes
    untrack(() => onloaded(null));
    if (!forKey) return;
    const timer = setTimeout(() => void load(forKey), mode === "url" ? 500 : 0);
    return () => clearTimeout(timer);
  });

  const sourceName = (m: typeof mode) => (m === "cdn" ? "the published version" : m === "url" ? "the URL" : "the file");
</script>

<div class="source">
  <div class="seg" role="group" aria-label="Source">
    <button type="button" class="pill" class:on={mode === "file"} aria-pressed={mode === "file"} onclick={() => (mode = "file")}
      data-help-name="File" data-help="An export file (an experience's Export – the draft or a version, with its plugin code) or a game.config.json from this computer.">File</button>
    <button type="button" class="pill" class:on={mode === "url"} aria-pressed={mode === "url"} onclick={() => (mode = "url")}
      data-help-name="URL" data-help="A game.config.json by URL – the reader's dev server serves its bundled one at /src/game.config.json. A content base (a CDN folder with latest.json, e.g. …/staging/demo) imports its current version.">URL</button>
    <button type="button" class="pill" class:on={mode === "cdn"} aria-pressed={mode === "cdn"} onclick={() => (mode = "cdn")} disabled={!published.length}
      title={published.length ? undefined : "No experience is published on this instance's environment yet"}
      data-help-name="Published" data-help="The current version of an experience on this instance's content CDN (CONTENT_BASE_URL/<experience>): the server reads its latest.json and the version it names.">Published</button>
  </div>
  {#if mode === "file"}
    <label class="stack"><span class="label">file</span>
      <input class="field" type="file" accept="application/json,.json" onchange={e => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
  {:else if mode === "url"}
    <label class="stack"><span class="label">URL</span>
      <input class="field" bind:value={url} placeholder="https://…/game.config.json"
        data-help-name="URL" data-help="A game.config.json, or a content base – a CDN folder with latest.json, e.g. https://buildingfictions.b-cdn.net/osct/staging/demo – whose current version is imported." /></label>
  {:else}
    <label class="stack"><span class="label">experience</span>
      <select class="field" bind:value={experience} data-help-name="Published experience" data-help="Whose published version to bring in – the experiences live on this instance's environment.">
        {#each published as p (p.id)}<option value={p.id}>{p.title} · {p.id}</option>{/each}
      </select></label>
  {/if}
  {#if needsAssets}
    <label class="stack"><span class="label">assets at</span>
      <input class="field" bind:value={assetsBase} placeholder="https://…/content/<version>"
        data-help-name="Assets at" data-help="Where /assets/content/… is served – the reader's origin, or the CDN's version folder. A content base URL and an export file fill it in themselves." /></label>
  {/if}
  {#if problem}
    <div class="problem" role="alert">
      <p class="danger small">{mode === "cdn" ? "The published version can't be read" : "The source can't be read"}: {problem.message}</p>
      {#if problem.url && !problem.message.includes(problem.url)}<p class="small muted url">{problem.url}</p>{/if}
      <button type="button" class="text-link" onclick={() => key && load(key)} disabled={previewing !== null}>Try again</button>
    </div>
  {:else if current}
    <table class="rows" aria-label="What comes in"
      data-help-name="What comes in" data-help="What the import brings in, read before anything is imported: where from, the build and when it was built, the app and schema version that built it, the experience in it and what it holds.">
      <tbody>
        {#if current.exportOf}<tr><th scope="row">Export of</th><td>{current.exportOf}</td></tr>{/if}
        {#each previewRows(current.preview, current.from, "assetsBase" in current.body ? (current.body.assetsBase ?? null) : current.preview.incoming.from) as row (row.label)}
          {#if !(into && row.label === "Experience")}<tr><th scope="row">{row.label}</th><td>{row.value}</td></tr>{/if}
        {/each}
        {#if current.preview.counts.plugins}<tr><th scope="row">Code</th><td>{current.preview.counts.plugins} plugin source{current.preview.counts.plugins === 1 ? "" : "s"}</td></tr>{/if}
      </tbody>
    </table>
  {:else if previewing}
    <p class="small muted" role="status">Reading {sourceName(mode)}…</p>
  {:else if failed === null && !key}
    <p class="small muted">{mode === "file" ? "Choose an export file or a game.config.json." : mode === "url" ? "Paste an address." : ""}</p>
  {/if}
</div>

<style>
  .source { display: grid; gap: .75rem; }
  .seg { display: inline-flex; gap: .125rem; justify-self: start; padding: .125rem; background: var(--control-background); border: 1px solid var(--line); }
  .stack { display: grid; gap: .3125rem; }
  .stack > .label { color: var(--muted); font-size: var(--text-small); letter-spacing: .06em; text-transform: uppercase; }
  .field { width: 100%; height: 2.125rem; background: var(--surface); }
  .field[type="file"] { padding-top: .3rem; }
  p { margin: 0; line-height: 1.45; }
  .problem { display: grid; gap: .25rem; justify-items: start; }
  .url { overflow-wrap: anywhere; }
  .rows { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .rows th, .rows td { padding: .3125rem .5rem .3125rem 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  .rows th { color: var(--muted); font-weight: 400; white-space: nowrap; }
  .rows td { overflow-wrap: anywhere; }
</style>
