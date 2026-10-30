<script lang="ts">
  import { tick } from "svelte";
  import { ApiError, importBook, type ImportBody, type ImportComparison, type ImportConfirmation } from "#lib/api.js";
  import { comparisonRows, confirmLabel, editLabel, editsLine, importedLine, liveLine } from "#lib/import-compare.js";
  import type { GameConfiguration } from "@engine/types";

  /**
   * Import a game configuration into the database (`POST /editor/books/{id}/import`): the instance's published
   * content (the server fetches its CDN), or a `game.config.json` by URL or file – the reader's dev server serves its
   * bundled one at `/src/game.config.json`, so the fixture's studio spreads are one import away. A URL that names no
   * file is a **content base** (a CDN folder with `latest.json`, like `…/demo`): the form takes the current version's
   * configuration and its folder as the assets base. `assetsBase` is where the configuration's `/assets/content/…`
   * paths resolve: the draft and every publish point there. The books page shows it open beside the books (#153);
   * the explanations are the fields' Info view help.
   * Over a book that exists the API answers with a version comparison first (#183): the form shows what comes in
   * against what the draft is based on and its edits since, and imports only when the person confirms here.
   */
  let { ondone, oncancel }: { ondone: (bookId: string) => void; oncancel?: () => void } = $props();

  // Only on a developer's machine is the reader's dev server next door (port 5174, serving its bundled configuration at
  // /src/game.config.json). On an instance the fields start empty and the instance's published content is the default
  const local = typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const readerGuess = local ? `${location.protocol}//${location.hostname}:5174` : "";
  let mode = $state<"cdn" | "url" | "file">(local ? "url" : "cdn");
  let url = $state(local ? `${readerGuess}/src/game.config.json` : "");
  let assetsBase = $state(readerGuess);
  let cdnBook = $state("osct");
  let file = $state<File | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  /** The comparison waiting for the person's confirmation, with what to send again */
  let pending = $state<{ bookId: string; body: ImportBody; comparison: ImportComparison; confirmation: ImportConfirmation; changed: boolean } | null>(null);
  let compareElement = $state<HTMLElement | null>(null);

  /** One import call; a comparison answer (409 confirm-import / confirmation-void) becomes the step to confirm */
  const send = async (bookId: string, body: ImportBody) => {
    try {
      const { book } = await importBook(bookId, body);
      pending = null;
      ondone(book.id);
    } catch (e) {
      if (!(e instanceof ApiError) || (e.code !== "confirm-import" && e.code !== "confirmation-void")) throw e;
      const again: ImportBody = { ...body };
      delete again.confirm;
      pending = {
        bookId,
        body: again,
        comparison: e.details.comparison as ImportComparison,
        confirmation: e.details.confirmation as ImportConfirmation,
        changed: e.code === "confirmation-void",
      };
      await tick();
      compareElement?.querySelector<HTMLButtonElement>("button.primary")?.focus();
    }
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      if (mode === "cdn") {
        const id = cdnBook.trim();
        if (!id) throw new Error("Name the book's id (the configuration's book.id)");
        return await send(id, { source: "cdn" });
      }
      let configuration: GameConfiguration;
      let base = assetsBase.trim().replace(/\/+$/, "");
      if (mode === "url") {
        let configurationUrl = url.trim();
        if (!/\.json(\?.*)?$/i.test(configurationUrl)) {
          // A content base: latest.json names the current version, its folder holds the configuration and the files
          const contentBase = configurationUrl.replace(/\/+$/, "");
          const manifest = await fetch(`${contentBase}/latest.json`, { cache: "no-store" });
          if (!manifest.ok) throw new Error(`${contentBase}/latest.json: ${manifest.status} ${manifest.statusText}`);
          const { build } = (await manifest.json()) as { build?: string };
          if (!build) throw new Error(`${contentBase}/latest.json names no version`);
          configurationUrl = `${contentBase}/${build}/game.config.json`;
          if (!base || base === readerGuess) base = `${contentBase}/${build}`;
        }
        const response = await fetch(configurationUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`${configurationUrl}: ${response.status} ${response.statusText}`);
        configuration = (await response.json()) as GameConfiguration;
      } else {
        if (!file) throw new Error("Choose a game.config.json file");
        configuration = JSON.parse(await file.text()) as GameConfiguration;
      }
      const id = configuration.book?.id;
      if (!id) throw new Error("The configuration has no book.id");
      await send(id, { configuration, assetsBase: base || undefined });
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : String(e);
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
      error = e instanceof ApiError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : String(e);
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
      data-help-name="The CDN" data-help="The server fetches the current version of its content CDN (OSCT_CONTENT_BASE_URL) for the book of this id.">the CDN</button>
  </div>
  {#if mode === "url"}
    <label class="stack"><span class="label">URL</span>
      <input class="field" bind:value={url} placeholder="https://…/game.config.json" required
        data-help-name="URL" data-help="A game.config.json, or a content base – a CDN folder with latest.json, e.g. https://buildingfictions.b-cdn.net/demo – whose current version is imported." /></label>
  {:else if mode === "file"}
    <label class="stack"><span class="label">file</span>
      <input class="field" type="file" accept="application/json,.json" onchange={e => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
  {:else}
    <label class="stack"><span class="label">book id</span>
      <input class="field" bind:value={cdnBook} placeholder="osct" required
        data-help-name="Book id" data-help="The id of the book the CDN's current version holds (its configuration's book.id) – the draft it replaces." /></label>
  {/if}
  {#if mode !== "cdn"}
    <label class="stack"><span class="label">assets at</span>
      <input class="field" bind:value={assetsBase} placeholder="https://…/content/<version>"
        data-help-name="Assets at" data-help="Where /assets/content/… is served – the reader's origin, or the CDN's version folder. A content base URL fills it in itself." /></label>
  {/if}
  {#if error}<p class="danger small">{error}</p>{/if}
  <p class="actions">
    <button type="submit" class="pill primary" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    {#if oncancel}<button type="button" class="text-link" onclick={oncancel}>Cancel</button>{/if}
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
  .actions { display: flex; align-items: center; gap: .75rem; margin: .25rem 0 0; }
  .actions .pill { height: 2.125rem; padding: 0 1.25rem; }
  .compare p { margin: 0; line-height: 1.45; }
  .rows { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .rows th, .rows td { padding: .3125rem .5rem .3125rem 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  .rows thead th { color: var(--muted); font-size: var(--text-small); font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
  .rows tbody th { color: var(--muted); font-weight: 400; white-space: nowrap; }
  .rows tr.differs td { font-weight: 600; }
  .edits { margin: -.375rem 0 0; padding-left: 1rem; line-height: 1.5; }
</style>
