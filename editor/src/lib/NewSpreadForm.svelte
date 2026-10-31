<script lang="ts">
  import { untrack } from "svelte";
  import type { SpreadFormat } from "@shared/types/game-config";
  import { addSpread, errorText } from "#lib/api.js";
  import { creatableFormats, defaultAfter, followable, newPagesAfter, type EditableSpread } from "#lib/spread-edit.js";
  import { captionOf, formatLabelOf, pagesOf } from "#lib/spread-grid.js";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The creation step of a new spread (#238) – in the page, no browser dialog: the **format** (a double page, the cover,
   * the back cover – only those the book can still take), the **title**, and for a double page **where** it goes (after
   * which spread; its pages are the next two and every later page moves on by two, #166). *Create* asks the API
   * (`POST …/spreads`); the caller reloads and shows the new spread. Shown only for a digital-first book.
   */
  let { bookId, spreads, after = null, oncreated, oncancel }: {
    bookId: string;
    spreads: readonly EditableSpread[];
    /** The spread a double page follows at first (the menu's *Add a double page after*); none: the last before the back cover */
    after?: string | null;
    oncreated: (spreadId: string) => void | Promise<void>;
    oncancel: () => void;
  } = $props();

  const formats = $derived(creatableFormats(spreads));
  let format = $state<SpreadFormat>("spread");
  let title = $state("");
  let place = $state<string | null>(untrack(() => defaultAfter(spreads, after)));
  let busy = $state(false);
  let error = $state<string | null>(null);

  const FORMAT_LABELS: Record<SpreadFormat, string> = { spread: "double page", cover: "cover", back: "back cover" };
  const options = $derived(followable(spreads));
  const pages = $derived(newPagesAfter(spreads, place));
  const anchor = $derived(spreads.find(s => s.id === place));
  const later = $derived(!!anchor && spreads.some(s => s.firstPage > anchor.lastPage));
  const labelOf = (spread: EditableSpread) => formatLabelOf(spread) ? [formatLabelOf(spread), captionOf(spread)].filter(Boolean).join(" · ") : `p. ${captionOf(spread) || pagesOf(spread)}`;

  const create = async () => {
    busy = true;
    error = null;
    try {
      const name = title.trim() || undefined;
      const { spread } = await addSpread(bookId, format === "spread" ? { format, ...(place ? { after: place } : {}), ...(name ? { title: name } : {}) } : { format, ...(name ? { title: name } : {}) });
      await oncreated(spread.id);
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<form class="new-spread" aria-label="New spread" onsubmit={e => { e.preventDefault(); void create(); }}>
  <div class="section"><span class="section-label">new spread</span>
    <button type="button" class="text-link" onclick={oncancel}>cancel</button></div>
  <div class="row" data-help-name="Format" data-help="A double page (two printed pages), the front cover (page 0, first) or the back cover (the page after the last) – a book has one of each cover.">
    <span class="label">format</span>
    <span class="controls"><Segmented options={formats} value={format} labels={FORMAT_LABELS} label="New spread's format" onchange={f => (format = f)} /></span></div>
  <div class="row" data-help-name="Title" data-help="The spread's name in the editor; empty: New spread, Cover or Back cover.">
    <span class="label">title</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={title} placeholder={format === "spread" ? "New spread" : FORMAT_LABELS[format]} aria-label="New spread's title" autofocus /></div>
  {#if format === "spread"}
    <div class="row" data-help-name="Position" data-help="The spread the double page follows. It takes the two pages after that spread's last page; every later spread, entry and printed page moves on by two (the layout's sheets stay with their page numbers until a new layout is imported).">
      <span class="label">after</span>
      <select class="field" aria-label="The spread it follows" value={place ?? ""} onchange={e => (place = e.currentTarget.value || null)}>
        {#if !options.length}<option value="">the start of the book</option>{/if}
        {#each options as spread (spread.id)}<option value={spread.id}>{labelOf(spread)}</option>{/each}
      </select></div>
    <div class="row"><span class="label">pages</span>
      <span class="small muted">{pages.first}–{pages.last}{later ? " · the pages after it move on by two" : ""}</span></div>
  {:else}
    <div class="row"><span class="label">pages</span>
      <span class="small muted">{format === "cover" ? "page 0, the first spread" : "the page after the last, the last spread"}</span></div>
  {/if}
  <div class="actions">
    <span class="grow"></span>
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="submit" class="pill primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
  </div>
</form>

<style>
  .new-spread { display: flex; flex-direction: column; gap: .125rem; }
  .row > .field { width: 100%; min-width: 0; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
