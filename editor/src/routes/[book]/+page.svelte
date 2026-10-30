<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { addSpread, ApiError, deleteSpread, getBook, type BookTree } from "#lib/api.js";
  import { followBlockedBy, removeBlockedBy } from "#lib/spread-edit.js";
  import { removalStep, type RemovalStep } from "#lib/removal.js";
  import RemovalConfirm from "#lib/components/RemovalConfirm.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import { menuTrigger } from "#lib/menu-trigger.js";
  import type { Point } from "#lib/context-menu.js";
  import { sheetForSpread, type StageLayout } from "#lib/stage/stage-layout.js";
  import { fetchBookLayout, printBoxes, sheetUrl } from "#lib/sheet-preview.js";
  import SheetPreview from "#lib/components/SheetPreview.svelte";
  import { captionOf, formatLabelOf, gridCells } from "#lib/spread-grid.js";
  import Icon from "#lib/components/Icon.svelte";
  import { environmentOf } from "@shared/types/environment";
  import InfoView from "#lib/components/InfoView.svelte";

  /**
   * A book's spreads, each as its picture: the layout's sheet (when the content carries one) with the targets' prints
   * over it (#153). Open one to work on its stage.
   */
  const bookId = $derived(page.params.book!);
  let tree = $state<BookTree | null>(null);
  let layout = $state<StageLayout | null>(null);
  let error = $state<string | null>(null);

  const hasFormat = (format: string) => !!tree?.spreads.some(s => s.format === format);
  let adding = $state(false);
  /** One change to the spreads, then the tree again (the pages may have been numbered anew) */
  const change = async (work: () => Promise<unknown>) => {
    adding = true;
    error = null;
    try {
      await work();
      tree = await getBook(bookId);
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    } finally {
      adding = false;
    }
  };
  /** The front or the back cover as a spread of its own (format cover / back, content schema 2.3) */
  const addCover = (format: "cover" | "back") => change(() => addSpread(bookId, { format }));
  /** A double page after `after` (default: the last one before the back cover); the later pages are numbered on */
  const addDoublePage = (after?: string) => change(() => addSpread(bookId, after ? { format: "spread", after } : { format: "spread" }));
  type Spread = BookTree["spreads"][number];

  // ── a card's menu (#196): right click, a long press or the menu key – the sheet carries no buttons ──
  let menu = $state<{ id: string; at: Point } | null>(null);
  /** The card a finger is held on: its light cue until the menu opens */
  let pressing = $state<string | null>(null);
  /** The cards' links, for the focus to come back to when the menu closes */
  const links: Record<string, HTMLAnchorElement> = {};
  const openCard = (spread: Spread) => void goto(resolve(`${bookId}/${spread.id}/`));
  const menuItems = (spread: Spread): MenuItem[] => {
    const busy = adding ? "A change to the spreads is under way." : null;
    return [
      { label: "Open", icon: "open", help: "Opens the spread's stage.", select: () => openCard(spread) },
      { label: "Add a double page after", icon: "plus", disabled: busy ?? followBlockedBy(spread), select: () => void addDoublePage(spread.id),
        help: "A double page right after this spread. The pages after it are numbered on by two, their entries move with them." },
      { label: "Remove", icon: "trash", danger: true, disabled: busy ?? removeBlockedBy(spread, tree?.book.initialSpreadId), select: () => void askRemove(spread),
        help: "Removes this spread with its entries, targets and the entities used only there – it shows what goes and asks first; the pages after a double page are numbered back. Library files are kept unless you choose to delete the ones used only here. The spread the book opens on stays." },
    ];
  };

  /** The spread whose removal is being asked about, in its card, with the API's impact – no browser dialog (#198) */
  let confirming = $state<{ id: string; step: RemovalStep } | null>(null);
  let removing = $state(false);
  let removeError = $state<string | null>(null);
  /** The first step: the API answers 409 with what the removal takes and a confirmation id, and removes nothing */
  const askRemove = async (spread: Spread) => {
    error = null;
    removeError = null;
    try {
      await deleteSpread(bookId, spread.id);
    } catch (e) {
      const step = removalStep(e);
      if (step) confirming = { id: spread.id, step };
      else error = e instanceof ApiError ? e.message : String(e);
    }
  };
  const keep = (spread: Spread) => {
    confirming = null;
    links[spread.id]?.focus();
  };
  /** The second step: the same removal with the confirmation id; a void id brings the fresh impact to confirm again */
  const removeSpread = async (spread: Spread, deleteFiles: boolean) => {
    if (!confirming) return;
    removing = true;
    removeError = null;
    try {
      await deleteSpread(bookId, spread.id, confirming.step.confirmation.id, deleteFiles);
      confirming = null;
      tree = await getBook(bookId);
    } catch (e) {
      const step = removalStep(e);
      if (step) confirming = { id: spread.id, step };
      else removeError = e instanceof ApiError ? e.message : String(e);
    } finally {
      removing = false;
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
      · <button type="button" class="text-link" disabled={adding} onclick={() => void addDoublePage()}
        data-help="A double page after the last one (before the back cover). Its pages are numbered on from there.">+ double page</button>
      {#if !hasFormat("cover")}· <button type="button" class="text-link" disabled={adding} onclick={() => void addCover("cover")}>+ cover</button>{/if}
      {#if !hasFormat("back")}· <button type="button" class="text-link" disabled={adding} onclick={() => void addCover("back")}>+ back cover</button>{/if}
    </p>
    {@const environment = environmentOf(tree.book.book)}
    {@const fileName = (url: string) => decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? url)}
    <p class="muted small environment">environment ({tree.book.book?.environment ? "this book's" : "the default"}):
      world {environment.worldSrc ? fileName(environment.worldSrc) : "café"} · sky {environment.skySrc ? fileName(environment.skySrc) : "the world's"} ·
      onion sky {environment.onionSky ? "on" : "off"}
      {#if tree.spreads[0]}· <a class="text-link" href={resolve(`${bookId}/${tree.spreads[0].id}/?tab=environment`)}>Edit on the stage</a>{/if}</p>
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
          <li style:grid-column="span {cell.span}" class:right={cell.side === "right"} class:left={cell.side === "left"}
            class:pressing={pressing === spread.id} class:menu-open={menu?.id === spread.id}>
            <a href={resolve(`${bookId}/${spread.id}/`)} class="spread" draggable="false" aria-haspopup="menu" aria-expanded={menu?.id === spread.id}
              bind:this={links[spread.id]}
              data-help="Opens the spread's stage. Its menu – a right click, a long press, or the menu key – adds a double page after it or removes it."
              {@attach menuTrigger({
                open: at => { confirming = null; menu = { id: spread.id, at }; },
                pressing: on => { pressing = on ? spread.id : pressing === spread.id ? null : pressing; },
              })}>
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
            {#if confirming?.id === spread.id}
              <RemovalConfirm step={confirming.step} busy={removing || adding} error={removeError}
                onconfirm={deleteFiles => void removeSpread(spread, deleteFiles)} oncancel={() => keep(spread)} />
            {/if}
            {#if menu?.id === spread.id}
              <ContextMenu at={menu.at} label="Spread {caption || format || spread.title}" head={[format, caption].filter(Boolean).join(" · ") || spread.title}
                items={menuItems(spread)} returnFocus={links[spread.id]} onclose={() => (menu = null)} />
            {/if}
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
  /* The repeated track is a pair of pages: the column count stays even, a double page never wraps */
  .spreads { --page-min: 9rem; list-style: none; margin: .5rem 0; padding: 0; display: grid; gap: 1rem 0;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--page-min), 50%), 1fr) minmax(min(var(--page-min), 50%), 1fr)); }
  @media (min-width: 96rem) { .spreads { --page-min: 10rem; } }
  /* A held finger opens the card's menu: no text selection, no callout, no dragged link */
  .spread { display: block; text-decoration: none; border-radius: var(--control-radius);
    -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; -webkit-user-drag: none; }
  .spread :global(img) { -webkit-user-drag: none; }
  /* Half a gap on each side, none on a single page's gutter: every sheet has the same height */
  .spreads > li { position: relative; padding: 0 .5rem; min-width: 0; }
  .pressing .frame, .menu-open .frame { border-color: var(--text); }
  .pressing .frame { transform: scale(.98); transition: transform .5s ease-out, border-color .15s; }
  @media (prefers-reduced-motion: reduce) { .pressing .frame { transform: none; } }
  .spreads > li.right { padding-left: 0; }
  .spreads > li.left { padding-right: 0; }
  .spread:focus-visible .frame { border-color: var(--text); }
  @media (hover: hover) {
    .spread:hover .frame { border-color: var(--text); }
  }
  .frame { display: block; border: 1px solid var(--line); transition: border-color .15s, transform .15s; }
  .caption { display: flex; flex-wrap: wrap; align-items: center; gap: .125rem .5rem; padding: .25rem 0; }
  .text { flex: 1 1 6rem; min-width: 0; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .format { border: 1px solid var(--line); padding: 0 .25rem; font-size: .75em; text-transform: uppercase; white-space: nowrap; }
  .stats { margin-left: auto; display: inline-flex; gap: .5rem; white-space: nowrap; }
  .info-dock { position: fixed; left: 0; bottom: 0; z-index: 2; width: var(--tree-width); border-right: 1px solid var(--line); }
  /* Room below the last row: its caption scrolls clear of the Info dock */
  @media (min-width: 48rem) { main { padding-bottom: 13rem; } }
  /* A phone has no pointer to describe controls for */
  @media (max-width: 47.9rem) { .info-dock { display: none; } main { padding: .75rem 1rem; } }
  .stats span { display: inline-flex; align-items: center; gap: .125rem; }
</style>
