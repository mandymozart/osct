<script lang="ts">
  import { tick } from "svelte";
  import { confirmationStep } from "@shared/api/errors";
  import { errorText, importBook, previewImport, type Confirmation, type ImportBody, type ImportComparison, type ImportPreview } from "#lib/api.js";
  import { comparisonRows, confirmLabel, editLabel, editsLine, importedLine, liveLine } from "#lib/import-compare.js";
  import { contentBaseOf, importLabel, lossLine, previewRows, readConfiguration, readContentBase, replaceLine, sourceErrorLine } from "#lib/import-preview.js";
  import type { GameConfiguration } from "@engine/types";

  /**
   * Import a game configuration into the database (`POST /editor/books/{id}/import`): the instance's published
   * content (the server fetches its CDN), or a `game.config.json` by URL or file – the reader's dev server serves its
   * bundled one at `/src/game.config.json`, so the fixture's studio spreads are one import away. A URL that names no
   * file is a **content base** (a CDN folder with `latest.json`, like `…/demo`): the form takes the current version's
   * configuration and its folder as the assets base. `assetsBase` is where the configuration's `/assets/content/…`
   * paths resolve: the draft and every publish point there. The books page shows it open beside the books (#153);
   * the explanations are the fields' Info view help.
   * Before anything is imported the form shows what comes in (#182, `POST /editor/import/preview`): the content base and
   * its current build, the one book in it with what it holds, and – when a draft of that id is here – that the import
   * replaces it and what is lost. The book's id comes from the configuration; the button names the book and the build,
   * and imports exactly what was previewed (for a URL or a file, the configuration read for the preview).
   * Over a book that exists the API answers with a version comparison first (#183): the form shows what comes in
   * against what the draft is based on and its edits since, and imports only when the person confirms here.
   */
  let { ondone }: { ondone: (bookId: string) => void } = $props();

  // Only on a developer's machine is the reader's dev server next door (port 5174, serving its bundled configuration at
  // /src/game.config.json). On an instance the fields start empty and the instance's published content is the default
  const local = typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const readerGuess = local ? `${location.protocol}//${location.hostname}:5174` : "";
  let mode = $state<"cdn" | "url" | "file">(local ? "url" : "cdn");
  let url = $state(local ? `${readerGuess}/src/game.config.json` : "");
  let assetsBase = $state(readerGuess);
  let file = $state<File | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  /** The preview of the source as it is now: what the server said, and for a URL or a file what was read */
  type Loaded = { key: string; preview: ImportPreview; from: string | null; configuration?: GameConfiguration; versionFolder?: string };
  let loaded = $state<Loaded | null>(null);
  let previewing = $state<string | null>(null);
  let previewError = $state<{ key: string; message: string; url: string | null } | null>(null);
  /** The comparison waiting for the person's confirmation, with what to send again */
  let pending = $state<{ bookId: string; body: ImportBody; comparison: ImportComparison; confirmation: Confirmation; changed: boolean } | null>(null);
  let compareElement = $state<HTMLElement | null>(null);

  /** What the preview is of – a new key reads the source again; null: nothing to read yet */
  const sourceKey = (): string | null => {
    if (mode === "cdn") return "cdn";
    if (mode === "url") return /^https?:\/\/\S+$/i.test(url.trim()) ? `url ${url.trim()}` : null;
    return file ? `file ${file.name} ${file.size} ${file.lastModified}` : null;
  };
  const key = $derived(sourceKey());
  const current = $derived(loaded && loaded.key === key ? loaded : null);
  const failed = $derived(previewError && previewError.key === key ? previewError : null);

  /** Where the import's `/assets/content/…` paths resolve: the field, else a content base's version folder */
  const assetsAt = $derived.by(() => {
    if (!current) return null;
    if (mode === "cdn") return current.preview.incoming.from;
    const field = assetsBase.trim().replace(/\/+$/, "");
    if (current.versionFolder && (!field || field === readerGuess)) return current.versionFolder;
    return field || null;
  });

  const readSource = async (forKey: string): Promise<Loaded> => {
    if (mode === "cdn") {
      const preview = await previewImport({ source: "cdn" });
      return { key: forKey, preview, from: preview.contentBase };
    }
    if (mode === "url") {
      const contentBase = contentBaseOf(url);
      if (contentBase) {
        const read = await readContentBase(contentBase);
        const preview = await previewImport({ configuration: read.configuration });
        return { key: forKey, preview: { ...preview, contentBase, manifest: read.manifest }, from: contentBase, configuration: read.configuration, versionFolder: read.versionFolder };
      }
      const configurationUrl = url.trim();
      const configuration = await readConfiguration(configurationUrl);
      return { key: forKey, preview: await previewImport({ configuration }), from: configurationUrl, configuration };
    }
    if (!file) throw new Error("Choose a game.config.json file");
    let configuration: GameConfiguration;
    try {
      configuration = JSON.parse(await file.text()) as GameConfiguration;
    } catch {
      throw new Error(`${file.name} is not JSON.`);
    }
    return { key: forKey, preview: await previewImport({ configuration }), from: file.name, configuration };
  };

  /** Reads the source for `forKey`; an answer for a source that changed meanwhile is dropped */
  const load = async (forKey: string) => {
    previewing = forKey;
    try {
      const result = await readSource(forKey);
      if (key === forKey) {
        loaded = result;
        previewError = null;
      }
    } catch (e) {
      if (key === forKey) previewError = { key: forKey, ...sourceErrorLine(e) };
    } finally {
      if (previewing === forKey) previewing = null;
    }
  };

  // The preview follows the source: the CDN at once, a URL once typing pauses, a file when chosen
  $effect(() => {
    const forKey = key;
    if (!forKey || (loaded?.key === forKey)) return;
    const timer = setTimeout(() => void load(forKey), mode === "url" ? 500 : 0);
    return () => clearTimeout(timer);
  });

  /** One import call; a comparison answer (409 confirm-import / confirmation-void) becomes the step to confirm */
  const send = async (bookId: string, body: ImportBody) => {
    try {
      const { book } = await importBook(bookId, body);
      pending = null;
      ondone(book.id);
    } catch (e) {
      const step = confirmationStep<ImportComparison>(e, "import");
      if (!step) throw e;
      const again: ImportBody = { ...body };
      delete again.confirm;
      pending = { bookId, body: again, comparison: step.shows, confirmation: step.confirmation, changed: step.changed };
      await tick();
      compareElement?.querySelector<HTMLButtonElement>("button.primary")?.focus();
    }
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!current) {
      if (key && previewing !== key) void load(key);
      return;
    }
    busy = true;
    error = null;
    try {
      const bookId = current.preview.incoming.book;
      if (mode === "cdn") return await send(bookId, { source: "cdn" });
      if (!current.configuration) throw new Error("Read the source again");
      await send(bookId, { configuration: current.configuration, assetsBase: assetsAt ?? undefined });
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    busy = true;
    error = null;
    try {
      await send(pending.bookId, { ...pending.body, confirm: pending.confirmation.id });
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

{#if pending}
  {@const c = pending.comparison}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="import compare" aria-label="Compare before importing" bind:this={compareElement} onkeydown={e => { if (e.key === "Escape") pending = null; }}>
    <h2>Replace the draft of “{c.book.title}”?</h2>
    {#if pending.changed}<p class="danger small" role="alert">The draft or the incoming content changed since – compare again.</p>{/if}
    <table class="rows">
      <thead><tr><th></th><th scope="col">Coming in</th><th scope="col">Draft based on</th></tr></thead>
      <tbody>
        {#each comparisonRows(c) as row (row.label)}
          <tr class:differs={row.differs}><th scope="row">{row.label}</th><td>{row.incoming}</td><td>{row.draft}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="small muted">{importedLine(c)}</p>
    <p class:danger={c.draft.edits > 0}>{editsLine(c)}</p>
    {#if c.draft.recentEdits.length}
      <ul class="edits small muted">
        {#each c.draft.recentEdits.slice(0, 5) as edit, i (i)}<li>{editLabel(edit)}</li>{/each}
        {#if c.draft.edits > 5}<li>… and {c.draft.edits - 5} more</li>{/if}
      </ul>
    {/if}
    <p class="small">{liveLine(c)}</p>
    {#if error}<p class="danger small">{error}</p>{/if}
    <p class="actions">
      <button type="button" class="pill primary" onclick={confirmImport} disabled={busy}>{busy ? "Importing…" : confirmLabel(c)}</button>
      <button type="button" class="text-link" onclick={() => (pending = null)}>Cancel</button>
    </p>
  </section>
{:else}
<form class="import" onsubmit={submit}>
  <h2>Import a book</h2>
  <p class="lead muted">A book's game configuration becomes a draft here – by URL, as a file, or the instance's published content.</p>
  <div class="seg" role="group" aria-label="source">
    <button type="button" class="pill" class:on={mode === "url"} onclick={() => (mode = "url")}
      data-help-name="URL" data-help="A game.config.json by URL – the reader's dev server serves its bundled one at /src/game.config.json. A content base (a CDN folder with latest.json, e.g. …/demo) imports its current version.">URL</button>
    <button type="button" class="pill" class:on={mode === "file"} onclick={() => (mode = "file")}
      data-help-name="File" data-help="A game.config.json from this computer.">file</button>
    <button type="button" class="pill" class:on={mode === "cdn"} onclick={() => (mode = "cdn")}
      data-help-name="The CDN" data-help="The current version of this instance's content CDN (OSCT_CONTENT_BASE_URL): the server reads its latest.json and the book in that version. The form shows the book and the build before anything is imported.">the CDN</button>
  </div>
  {#if mode === "url"}
    <label class="stack"><span class="label">URL</span>
      <input class="field" bind:value={url} placeholder="https://…/game.config.json" required
        data-help-name="URL" data-help="A game.config.json, or a content base – a CDN folder with latest.json, e.g. https://buildingfictions.b-cdn.net/demo – whose current version is imported." /></label>
  {:else if mode === "file"}
    <label class="stack"><span class="label">file</span>
      <input class="field" type="file" accept="application/json,.json" onchange={e => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
  {/if}
  {#if mode !== "cdn"}
    <label class="stack"><span class="label">assets at</span>
      <input class="field" bind:value={assetsBase} placeholder="https://…/content/<version>"
        data-help-name="Assets at" data-help="Where /assets/content/… is served – the reader's origin, or the CDN's version folder. A content base URL fills it in itself." /></label>
  {/if}
  {#if failed}
    <div class="problem" role="alert">
      <p class="danger small">{mode === "cdn" ? "The CDN can't be read" : "The source can't be read"}: {failed.message}</p>
      {#if failed.url && !failed.message.includes(failed.url)}<p class="small muted url">{failed.url}</p>{/if}
      <button type="button" class="text-link" onclick={() => key && load(key)} disabled={previewing !== null}>Try again</button>
    </div>
  {:else if current}
    {@const p = current.preview}
    <table class="rows preview" aria-label="What comes in"
      data-help-name="What comes in" data-help="What the import brings in, read before anything is imported: where from, the build and when it was built, the app and schema version that built it, the one book in it and what it holds. Its id names the draft it becomes.">
      <tbody>
        {#each previewRows(p, current.from, assetsAt) as row (row.label)}
          <tr><th scope="row">{row.label}</th><td>{row.value}</td></tr>
        {/each}
      </tbody>
    </table>
    {#if p.existing}
      <div class="replace" role="status">
        <p class="danger">{replaceLine(p)}</p>
        <p class="small" class:danger={p.existing.draft.edits > 0}>{lossLine(p)}</p>
        <p class="small muted">{liveLine(p.existing)}</p>
      </div>
    {/if}
  {:else if previewing}
    <p class="small muted" role="status">Reading {mode === "cdn" ? "the CDN" : "the source"}…</p>
  {/if}
  {#if error}<p class="danger small">{error}</p>{/if}
  <p class="actions">
    <button type="submit" class="pill primary" disabled={busy || !current || previewing === key}>{busy ? "Importing…" : current ? importLabel(current.preview) : "Import"}</button>
  </p>
</form>
{/if}

<style>
  .import { display: grid; gap: .875rem; }
  h2 { font-size: 1.125rem; font-weight: 600; margin: 0; }
  .lead { margin: -.375rem 0 .25rem; font-size: .8125rem; line-height: 1.45; }
  .seg { display: inline-flex; gap: .125rem; justify-self: start; padding: .125rem; border-radius: calc(var(--control-radius) + .125rem); background: var(--control-background); border: 1px solid var(--line); }
  .stack { display: grid; gap: .3125rem; }
  .stack > .label { color: var(--muted); font-size: var(--text-small); letter-spacing: .06em; text-transform: uppercase; }
  .field { width: 100%; height: 2.125rem; background: var(--surface); }
  .field[type="file"] { padding-top: .3rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin: .25rem 0 0; }
  .actions .pill { min-height: 2.125rem; height: auto; padding: .375rem 1.25rem; text-align: left; }
  .compare p, .replace p, .problem p { margin: 0; line-height: 1.45; }
  .replace, .problem { display: grid; gap: .25rem; justify-items: start; }
  .url { overflow-wrap: anywhere; }
  .rows { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .rows th, .rows td { padding: .3125rem .5rem .3125rem 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  .rows thead th { color: var(--muted); font-size: var(--text-small); font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
  .rows tbody th { color: var(--muted); font-weight: 400; white-space: nowrap; }
  .rows tr.differs td { font-weight: 600; }
  .preview td { overflow-wrap: anywhere; }
  .edits { margin: -.375rem 0 0; padding-left: 1rem; line-height: 1.5; }
</style>
