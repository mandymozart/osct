<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { addSpread, ApiError, getBook, type BookTree } from "$lib/api";
  import { sheetForSpread, type StageLayout } from "$lib/stage/stage-layout";
  import { fetchBookLayout, printBoxes, sheetUrl } from "$lib/sheet-preview";
  import SheetPreview from "$lib/components/SheetPreview.svelte";
  import { captionOf, formatLabelOf, gridCells } from "$lib/spread-grid";
  import Icon from "$lib/components/Icon.svelte";
  import { environmentOf } from "@shared/types/environment";
  import InfoView from "$lib/components/InfoView.svelte";

  /**
   * A book's spreads, each as its picture: the layout's sheet (when the content carries one) with the targets' prints
   * over it (#153). Open one to work on its stage.
   */
  const bookId = $derived(page.params.book!);
  let tree = $state<BookTree | null>(null);
  let layout = $state<StageLayout | null>(null);
  let error = $state<string | null>(null);

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
    // The layout lives with the book's assets; without it (or without an assets base) the cards are blank pages with their prints
    layout = await fetchBookLayout(assetsBase);
  });

  const withTarget = (spread: BookTree["spreads"][number]) => spread.entries.filter(entry => entry.target?.imageSrc);
  const cells = $derived(gridCells(tree?.spreads ?? []));
  /** One page's proportions: a double page is twice as wide, so every card has the cover's height */
  const pageRatio = $derived(layout ? layout.page.width / layout.page.height : 230 / 320);
  const pageMm = $derived(layout?.page ?? { width: 230, height: 320 });
</script>

<main>
  {#if error}<p class="danger">{error}</p>{/if}
  {#if tree}
    <p class="muted small">{tree.book.author} · {tree.spreads.length} spreads · assets at {tree.book.assetsBase || "the draft's origin"}
      {#if !hasFormat("cover")}· <button type="button" class="text-link" disabled={adding} onclick={() => void addCover("cover")}>+ cover</button>{/if}
      {#if !hasFormat("back")}· <button type="button" class="text-link" disabled={adding} onclick={() => void addCover("back")}>+ back cover</button>{/if}
    </p>
    {@const environment = environmentOf(tree.book.book)}
    {@const fileName = (url: string) => decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? url)}
    <p class="muted small environment">environment ({tree.book.book?.environment ? "this book's" : "the default"}):
      world {environment.worldSrc ? fileName(environment.worldSrc) : "café"} · sky {environment.skySrc ? fileName(environment.skySrc) : "the world's"} ·
      onion sky {environment.onionSky ? "on" : "off"}
      {#if tree.spreads[0]}· <a class="text-link" href="{base}/{bookId}/{tree.spreads[0].id}/?tab=environment">Edit on the stage</a>{/if}</p>
    <ul class="spreads" style:--page-ratio={pageRatio}>
      {#each cells as cell, i (cell.spacer ? `spacer-${i}` : cell.spread.id)}
        {#if cell.spacer}
          <li class="spacer" aria-hidden="true"></li>
        {:else}
          {@const spread = cell.spread}
          {@const sheet = sheetForSpread(layout, spread)}
          {@const targets = withTarget(spread)}
          {@const caption = captionOf(spread)}
          {@const format = formatLabelOf(spread)}
          <li style:grid-column="span {cell.span}" class:right={cell.side === "right"} class:left={cell.side === "left"}>
            <a href="{base}/{bookId}/{spread.id}/" class="spread">
              <span class="frame">
                <SheetPreview ratio={cell.span * pageRatio} image={sheet ? sheetUrl(assetsBase, sheet) : null}
                  single={cell.span === 1 && !!sheet && !!layout && sheet.widthMm > layout.page.width * 1.5}
                  prints={printBoxes(targets.map(e => e.target!), cell.span, pageMm, assetsBase)} />
              </span>
              <span class="caption muted small">
                {#if caption}<span class="text" title={caption}>{caption}</span>{/if}
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

<aside class="info-dock"><InfoView /></aside>

<style>
  main { padding: 1rem 1.5rem; }
  /* One column is one page. The columns follow the width (#159): the repeated track is a *pair* of pages, so the
     count is always even and a double page never wraps (gridCells' layout holds for any even count); a page is at
     least --page-min wide (but a pair never wider than the grid), the rest is shared out */
  .spreads { --page-min: 9rem; list-style: none; margin: .5rem 0; padding: 0; display: grid; gap: 1rem 0;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--page-min), 50%), 1fr) minmax(min(var(--page-min), 50%), 1fr)); }
  @media (min-width: 96rem) { .spreads { --page-min: 10rem; } }
  .spread { display: block; text-decoration: none; border-radius: var(--control-radius); }
  /* No column gap: half a gap on each side of a card, none on a single page's gutter side – so a single page is
     exactly half a double page and every sheet has the same height (#115) */
  .spreads > li { padding: 0 .5rem; min-width: 0; }
  .spreads > li.right { padding-left: 0; }
  .spreads > li.left { padding-right: 0; }
  .spread:hover .frame, .spread:focus-visible .frame { border-color: var(--text); }
  .frame { display: block; border: 1px solid var(--line); transition: border-color .15s; }
  /* The caption wraps instead of cutting off (#159): the title takes up to two lines (the whole of it in its tooltip),
     the format and the stats keep together and move to the next line when the card is narrow */
  .caption { display: flex; flex-wrap: wrap; align-items: center; gap: .125rem .5rem; padding: .25rem 0; }
  .text { flex: 1 1 6rem; min-width: 0; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .format { border: 1px solid var(--line); padding: 0 .25rem; font-size: .75em; text-transform: uppercase; white-space: nowrap; }
  .stats { margin-left: auto; display: inline-flex; gap: .5rem; white-space: nowrap; }
  /* The page has no sidebar: the Info view sits at the bottom left, over the page */
  .info-dock { position: fixed; left: 0; bottom: 0; z-index: 2; width: var(--tree-width); border-right: 1px solid var(--line); }
  /* The dock covers the bottom left: room below the last row so its caption can be scrolled clear of it */
  @media (min-width: 48rem) { main { padding-bottom: 13rem; } }
  /* A phone has no pointer to describe controls for, and the dock would cover a third of the screen */
  @media (max-width: 47.9rem) { .info-dock { display: none; } main { padding: .75rem 1rem; } }
  .stats span { display: inline-flex; align-items: center; gap: .125rem; }
</style>
