<script lang="ts">
  import { ApiError, importBook } from "#lib/api.js";
  import type { GameConfiguration } from "@engine/types";

  /**
   * Import a game configuration into the database (`POST /editor/books/{id}/import`): the instance's published
   * content (the server fetches its CDN), or a `game.config.json` by URL or file – the reader's dev server serves its
   * bundled one at `/src/game.config.json`, so the fixture's studio spreads are one import away. A URL that names no
   * file is a **content base** (a CDN folder with `latest.json`, like `…/demo`): the form takes the current version's
   * configuration and its folder as the assets base. `assetsBase` is where the configuration's `/assets/content/…`
   * paths resolve: the draft and every publish point there. The books page shows it open beside the books (#153);
   * the explanations are the fields' Info view help.
   */
  let { ondone, oncancel }: { ondone: (bookId: string) => void; oncancel?: () => void } = $props();

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
  <p class="lead muted">A book's game configuration becomes a draft here – by URL, as a file, or the instance's published content.</p>
  <div class="seg" role="group" aria-label="source">
    <button type="button" class="pill" class:on={mode === "url"} onclick={() => (mode = "url")}
      data-help-name="URL" data-help="A game.config.json by URL – the reader's dev server serves its bundled one at /src/game.config.json. A content base (a CDN folder with latest.json, e.g. …/demo) imports its current version.">URL</button>
    <button type="button" class="pill" class:on={mode === "file"} onclick={() => (mode = "file")}
      data-help-name="File" data-help="A game.config.json from this computer.">file</button>
    <button type="button" class="pill" class:on={mode === "cdn"} onclick={() => (mode = "cdn")}
      data-help-name="The CDN" data-help="The server fetches the current version of its content CDN (OSCT_CONTENT_BASE_URL) and asks for the book's id.">the CDN</button>
  </div>
  {#if mode === "url"}
    <label class="stack"><span class="label">URL</span>
      <input class="field" bind:value={url} placeholder="https://…/game.config.json" required
        data-help-name="URL" data-help="A game.config.json, or a content base – a CDN folder with latest.json, e.g. https://buildingfictions.b-cdn.net/demo – whose current version is imported." /></label>
  {:else if mode === "file"}
    <label class="stack"><span class="label">file</span>
      <input class="field" type="file" accept="application/json,.json" onchange={e => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} /></label>
  {:else}
    <p class="small muted">The server fetches the current version of its content CDN.</p>
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
</style>
