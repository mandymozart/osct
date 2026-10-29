<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { addSpread, ApiError, getBook, type BookTree } from "$lib/api";
  import { session } from "$lib/session.svelte";
  import { sheetForSpread, type StageLayout } from "$lib/stage/stage-layout";
  import { captionOf, formatLabelOf, gridCells, GRID_COLUMNS } from "$lib/spread-grid";
  import Icon from "$lib/components/Icon.svelte";
  import PublishButton from "$lib/PublishButton.svelte";
  import EnvironmentPanel from "$lib/panels/EnvironmentPanel.svelte";

  /** A book's spreads with the sheet of each as its preview (when the content carries the layout): open one to work on its stage */
  const bookId = $derived(page.params.book!);
  let tree = $state<BookTree | null>(null);
  let layout = $state<StageLayout | null>(null);
  let error = $state<string | null>(null);

  const LAYOUT_PATH = "/assets/content/layout/";
  const hasFormat = (format: string) => !!tree?.spreads.some(s => (s as { format?: string }).format === format);
  let adding = $state(false);
  /** The front or the back cover as a spread of its own (format cover / back, content schema 2.3) */
  const addCover = async (format: "cover" | "back") => {
    adding = true;
    try {
      await addSpread(bookId, { format });
      tree = await getBook(bookId);
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    } finally {
      adding = false;
    }
  };
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

  const reload = async () => {
    tree = await getBook(bookId);
  };

  const withTarget = (spread: BookTree["spreads"][number]) => spread.entries.filter(entry => entry.target?.imageSrc);
  const cells = $derived(gridCells(tree?.spreads ?? []));
  /** One page's proportions: a double page is twice as wide, so every card has the cover's height */
  const pageRatio = $derived(layout ? layout.page.width / layout.page.height : 230 / 320);
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
    <p class="muted small">{tree.book.author} · {tree.spreads.length} spreads · assets at {tree.book.assetsBase || "the draft's origin"}
      {#if !hasFormat("cover")}· <button type="button" class="text-link" disabled={adding} onclick={() => void addCover("cover")}>+ cover</button>{/if}
      {#if !hasFormat("back")}· <button type="button" class="text-link" disabled={adding} onclick={() => void addCover("back")}>+ back cover</button>{/if}
    </p>
    <EnvironmentPanel bookId={bookId} saved={tree.book.book?.environment} onsaved={reload} />
    <ul class="spreads" style:--columns={GRID_COLUMNS} style:--page-ratio={pageRatio}>
      {#each cells as cell, i (cell.spacer ? `spacer-${i}` : cell.spread.id)}
        {#if cell.spacer}
          <li class="spacer" aria-hidden="true"></li>
        {:else}
          {@const spread = cell.spread}
          {@const sheet = sheetForSpread(layout, spread)}
          {@const targets = withTarget(spread)}
          {@const caption = captionOf(spread)}
          {@const format = formatLabelOf(spread)}
          <li style:grid-column="span {cell.span}">
            <a href="{base}/{bookId}/{spread.id}/" class="spread">
              <span class="sheet" style:aspect-ratio={cell.span * pageRatio}>
                {#if sheet}<img src="{assetsBase}{LAYOUT_PATH}{sheet.image}" alt="" loading="lazy" decoding="async" class:single={cell.span === 1 && !!layout && sheet.widthMm > layout.page.width * 1.5} />{/if}
              </span>
              <span class="caption muted small">
                {#if caption}<span class="text">{caption}</span>{/if}
                {#if format}<span class="format">{format}</span>{/if}
                <span class="stats">
                  <span title="{spread.entries.length} entries" aria-label="{spread.entries.length} entries"><Icon name="entry" size="1em" stroke={2} />{spread.entries.length}</span>
                  <span title="{targets.length} targets" aria-label="{targets.length} targets"><Icon name="target" size="1em" stroke={2} />{targets.length}</span>
                  <span title="{targets.filter(e => e.target?.entity).length} with AR" aria-label="{targets.filter(e => e.target?.entity).length} with AR"><Icon name="model" size="1em" stroke={2} />{targets.filter(e => e.target?.entity).length}</span>
                </span>
              </span>
            </a>
          </li>
        {/if}
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
  main { max-width: 80rem; margin: 0 auto; padding: 1rem; }
  .spreads { list-style: none; margin: .5rem 0; padding: 0; display: grid; gap: .75rem .25rem; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); }
  .spread { display: block; text-decoration: none; border-radius: var(--control-radius); }
  .spread:hover { background: var(--hover-background); }
  .sheet { display: block; width: 100%; background: var(--surface-head); overflow: hidden; }
  .sheet img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .sheet img.single { width: 200%; max-width: none; margin-left: -100%; }
  .caption { display: flex; align-items: center; gap: .5rem; padding: .25rem 0; white-space: nowrap; overflow: hidden; }
  .text { overflow: hidden; text-overflow: ellipsis; }
  .format { border: 1px solid var(--line); padding: 0 .25rem; font-size: .75em; text-transform: uppercase; }
  .stats { margin-left: auto; display: inline-flex; gap: .5rem; }
  .stats span { display: inline-flex; align-items: center; gap: .125rem; }
</style>
