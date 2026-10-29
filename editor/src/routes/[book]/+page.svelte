<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { ApiError, getBook, type BookTree } from "$lib/api";
  import { session } from "$lib/session.svelte";
  import { sheetForSpread, type StageLayout } from "$lib/stage/stage-layout";
  import PublishButton from "$lib/PublishButton.svelte";

  /** A book's spreads with the sheet of each as its preview (when the content carries the layout): open one to work on its stage */
  const bookId = $derived(page.params.book!);
  let tree = $state<BookTree | null>(null);
  let layout = $state<StageLayout | null>(null);
  let error = $state<string | null>(null);

  const LAYOUT_PATH = "/assets/content/layout/";
  const assetsBase = $derived((tree?.book.assetsBase ?? "").replace(/\/+$/, ""));

  onMount(async () => {
    try {
      tree = await getBook(bookId);
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
      return;
    }
    // The layout lives with the book's assets; without it (or without an assets base) the list has no previews
    if (!assetsBase) return;
    try {
      const response = await fetch(`${assetsBase}${LAYOUT_PATH}layout.json`);
      const data = response.ok ? await response.json() : null;
      layout = data && Array.isArray(data.sheets) && data.targets ? (data as StageLayout) : null;
    } catch {
      layout = null;
    }
  });

  const withTarget = (spread: BookTree["spreads"][number]) => spread.entries.filter(entry => entry.target?.imageSrc);
</script>

<header class="top">
  <a href="{base}/" class="pill">‹ Books</a>
  <strong>{tree?.book.title ?? bookId}</strong>
  <span class="grow"></span>
  <PublishButton {bookId} />
  <span class="muted small">{session.user?.email}</span>
</header>

<main>
  {#if error}<p class="danger">{error}</p>{/if}
  {#if tree}
    <p class="muted small">{tree.book.author} · {tree.spreads.length} spreads · assets at {tree.book.assetsBase || "the draft's origin"}</p>
    <ul class="spreads">
      {#each tree.spreads as spread (spread.id)}
        {@const sheet = sheetForSpread(layout, spread)}
        <li>
          <a href="{base}/{bookId}/{spread.id}/" class="spread" class:with-sheet={!!layout}>
            {#if layout}
              <span class="sheet" style:aspect-ratio={sheet ? `${sheet.widthMm} / ${sheet.heightMm}` : "2 / 1.4"}>
                {#if sheet}<img src="{assetsBase}{LAYOUT_PATH}{sheet.image}" alt="" loading="lazy" decoding="async" />{/if}
              </span>
            {/if}
            <span class="pages">{spread.firstPage}{spread.lastPage !== spread.firstPage ? `–${spread.lastPage}` : ""}</span>
            <span class="title">{spread.title}</span>
            <span class="muted small">{spread.entries.length} entries · {withTarget(spread).length} targets · {withTarget(spread).filter(e => e.target?.entity).length} with AR</span>
          </a>
        </li>
      {/each}
    </ul>
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</main>

<style>
  .top { display: flex; align-items: center; gap: .75rem; height: 2.5rem; padding: 0 .75rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .top a { text-decoration: none; }
  .grow { flex: 1; }
  main { max-width: 48rem; margin: 0 auto; padding: 1rem; }
  .spreads { list-style: none; margin: .5rem 0; padding: 0; display: grid; gap: .25rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); }
  .spread { display: grid; grid-template-columns: 3.5rem 1fr; gap: 0 .5rem; align-items: baseline; padding: .5rem .625rem; border: 1px solid var(--line); border-radius: var(--control-radius); text-decoration: none; }
  .spread:hover { background: var(--hover-background); }
  .pages { color: var(--muted); font-variant-numeric: tabular-nums; }
  .spread .small { grid-column: 2; }
  .spread .sheet { grid-column: 1 / -1; display: block; width: 100%; margin-bottom: .375rem; background: var(--surface-head); border: 1px solid var(--line); overflow: hidden; }
  .spread .sheet img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .with-sheet { align-content: start; }
</style>
