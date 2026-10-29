<script lang="ts">
  import { ApiError, importBook } from "$lib/api";
  import type { GameConfiguration } from "@engine/types";

  /**
   * Import a game configuration into the database (`POST /editor/books/{id}/import`): the instance's published
   * content (the server fetches its CDN), or a `game.config.json` by URL or file – the reader's dev server serves its
   * bundled one at `/src/game.config.json`, so the fixture's studio spreads are one import away. A URL that names no
   * file is a **content base** (a CDN folder with `latest.json`, like `…/demo`): the form takes the current version's
   * configuration and its folder as the assets base. `assetsBase` is where the configuration's `/assets/content/…`
   * paths resolve: the draft and every publish point there.
   */
  let { ondone, oncancel }: { ondone: (bookId: string) => void; oncancel: () => void } = $props();

  const readerGuess = typeof location === "undefined" ? "" : `${location.protocol}//${location.hostname}:5174`;
  let mode = $state<"cdn" | "url" | "file">("url");
  let url = $state(`${readerGuess}/src/game.config.json`);
  let assetsBase = $state(readerGuess);
  let file = $state<File | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      if (mode === "cdn") {
        const id = prompt("Book id (the configuration's book.id):", "osct")?.trim();
        if (!id) return;
        const { book } = await importBook(id, { source: "cdn" });
        return ondone(book.id);
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
      const { book } = await importBook(id, { configuration, assetsBase: base || undefined });
      ondone(book.id);
    } catch (e) {
      error = e instanceof ApiError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  };
</script>

<form class="import" onsubmit={submit}>
  <h2>Import a book</h2>
  <div class="row"><span class="label">source</span>
    <span class="controls">
      <span class="seg">
        <button type="button" class="pill" class:on={mode === "url"} onclick={() => (mode = "url")}>URL</button>
        <button type="button" class="pill" class:on={mode === "file"} onclick={() => (mode = "file")}>file</button>
        <button type="button" class="pill" class:on={mode === "cdn"} onclick={() => (mode = "cdn")}>the CDN</button>
      </span>
    </span></div>
  {#if mode === "url"}
    <label class="row"><span class="label">URL</span><input class="field" bind:value={url} placeholder="https://…/game.config.json" required /></label>
    <p class="small muted hint">The reader's dev server serves its bundled configuration at <code>/src/game.config.json</code> (the fixture: the studio spreads, the demo book). A content base URL (a CDN folder with <code>latest.json</code>, e.g. <code>…/demo</code>) imports its current version.</p>
  {:else if mode === "file"}
    <label class="row"><span class="label">file</span><input class="field" type="file" accept="application/json,.json" onchange={e => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
  {:else}
    <p class="small muted hint">The server fetches the current version of its content CDN (<code>OSCT_CONTENT_BASE_URL</code>).</p>
  {/if}
  {#if mode !== "cdn"}
    <label class="row"><span class="label">assets at</span><input class="field" bind:value={assetsBase} placeholder="https://localhost:5174" /></label>
    <p class="small muted hint">Where <code>/assets/content/…</code> is served – the reader's origin, or the CDN's version folder.</p>
  {/if}
  {#if error}<p class="danger small">{error}</p>{/if}
  <p class="actions">
    <button type="submit" class="pill primary" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    <button type="button" class="text-link" onclick={oncancel}>Cancel</button>
  </p>
</form>

<style>
  .import { border: 1px solid var(--line); border-radius: var(--control-radius); padding: .75rem; display: grid; gap: .25rem; }
  h2 { font-size: var(--text-size); font-weight: 600; margin: 0 0 .25rem; }
  .seg { display: inline-flex; gap: .125rem; }
  .field { width: 100%; }
  .hint { margin: 0 0 .25rem; padding-left: 5.125rem; }
  .actions { display: flex; align-items: center; gap: .75rem; margin: .5rem 0 0; }
  code { font-size: var(--text-small); }
</style>
