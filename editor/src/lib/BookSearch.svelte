<script lang="ts">
  import { tick } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { content } from "#lib/content.svelte.js";
  import { selection } from "#lib/selection.svelte.js";
  import { flatHits, searchBook, stepHit, type SearchHit, type SearchKind } from "#lib/book-search.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";

  /**
   * The top bar's search through the open book (#237, `book-search.ts`): entries, spreads, targets and named nodes,
   * grouped by kind with their spread and page. A pick goes to that spread and selects the item – an entry's form, a
   * target, a node – and the Inspector shows it (`selection.show`, or `requestOn` + the route for another spread). Keys:
   * `/` or Ctrl+K focuses it, ↑ ↓ walk the hits, Enter picks, Esc closes. On a phone it is an icon that opens the field
   * over the top bar. The draft is read on the first focus where no spread has loaded it yet (the book page).
   */
  let { bookId }: { bookId: string } = $props();

  let query = $state("");
  let open = $state(false);
  /** A phone: the field lies over the top bar while it is open */
  let expanded = $state(false);
  let active = $state(-1);
  let input = $state<HTMLInputElement>();
  let box = $state<HTMLDivElement>();

  const spreads = $derived(content.bookId === bookId ? content.spreads : []);
  const groups = $derived(open ? searchBook(spreads, query) : []);
  const hits = $derived(flatHits(groups));
  const ICON: Record<SearchKind, IconName> = { entry: "entry", spread: "book", target: "target", node: "node" };
  const LISTBOX = "book-search-results";
  const optionId = (hit: SearchHit) => `book-search-${hit.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  $effect(() => {
    void query;
    active = -1;
  });

  /** The draft, where no workspace has loaded it yet */
  const ensureDraft = () => {
    if (content.bookId !== bookId && !content.loading) void content.load(bookId);
  };
  const focusField = async () => {
    expanded = true;
    await tick();
    input?.focus();
    input?.select();
  };
  const close = () => {
    open = false;
    expanded = false;
    active = -1;
  };
  const pick = (hit: SearchHit) => {
    close();
    input?.blur();
    if (page.params.spread === hit.spreadId) selection.show(hit.select);
    else {
      selection.requestOn(hit.spreadId, hit.select);
      void goto(resolve(`${bookId}/${hit.spreadId}/`));
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open = true;
      active = stepHit(hits.length, active, event.key === "ArrowDown" ? 1 : -1);
      void tick().then(() => document.getElementById(hits[active] ? optionId(hits[active]) : "")?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Enter") {
      const hit = hits[active] ?? hits[0];
      if (hit) {
        event.preventDefault();
        pick(hit);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query && open) query = "";
      else {
        close();
        input?.blur();
      }
    }
  };
  /** `/` (outside a field) or Ctrl / ⌘ + K anywhere focuses the search */
  const onWindowKey = (event: KeyboardEvent) => {
    const inField = (event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
    const shortcut = (event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey);
    if (shortcut || (event.key === "/" && !inField && !event.ctrlKey && !event.metaKey && !event.altKey)) {
      event.preventDefault();
      void focusField();
    }
  };
  /** A click outside the box closes it */
  const onWindowPointer = (event: PointerEvent) => {
    if (open && box && !box.contains(event.target as Node)) close();
  };
  const HELP = "Finds entries (title and text), spreads (title or a page number), targets and named nodes in the whole book – accents and case do not matter. ↑ ↓ choose, Enter goes there and selects it, Esc closes. / or Ctrl+K focuses it.";
</script>

<svelte:window onkeydown={onWindowKey} onpointerdown={onWindowPointer} />

<div class="search" class:expanded bind:this={box}>
  <button type="button" class="icon-button opener" onclick={() => { ensureDraft(); void focusField(); }} title="Search the book (/)" aria-label="Search the book"
    aria-expanded={expanded}><Icon name="search" /></button>
  <div class="field-box">
    <span class="glass" aria-hidden="true"><Icon name="search" size="1em" /></span>
    <input bind:this={input} class="field" type="search" placeholder="Search the book" bind:value={query} autocomplete="off" spellcheck="false"
      role="combobox" aria-label="Search the book" aria-expanded={open && !!query.trim()} aria-controls={LISTBOX} aria-autocomplete="list"
      aria-activedescendant={hits[active] ? optionId(hits[active]) : undefined} data-help-name="Search" data-help={HELP}
      onfocus={() => { ensureDraft(); open = true; }} oninput={() => (open = true)} onkeydown={onKey} />
    <kbd class="key small muted" aria-hidden="true">/</kbd>
    <button type="button" class="icon-button closer" onclick={close} title="Close the search" aria-label="Close the search"><Icon name="close" /></button>
  </div>
  {#if open && query.trim()}
    <div class="results" id={LISTBOX} role="listbox" aria-label="Search results">
      {#if content.bookId !== bookId}
        <p class="small muted note">{content.loading ? "Reading the book…" : "The book is not loaded."}</p>
      {:else if !groups.length}
        <p class="small muted note">Nothing found for “{query.trim()}”.</p>
      {:else}
        {#each groups as group (group.kind)}
          <div class="group" role="group" aria-label={group.label}>
            <div class="section-label head">{group.label}{#if group.more}<span class="more"> · {group.more} more</span>{/if}</div>
            {#each group.hits as hit (hit.key)}
              {@const index = hits.indexOf(hit)}
              <!-- The input keeps the focus: the options are picked with the pointer or Enter (aria-activedescendant) -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="hit" class:on={index === active} id={optionId(hit)} role="option" aria-selected={index === active} tabindex="-1"
                onpointerenter={() => (active = index)} onpointerdown={e => e.preventDefault()} onclick={() => pick(hit)}>
                <span class="icon"><Icon name={ICON[hit.kind]} size="1em" stroke={2} /></span>
                <span class="text">
                  <span class="label">{hit.label}</span>
                  <span class="where small muted">{hit.where}</span>
                  {#if hit.excerpt}<span class="excerpt small muted">{hit.excerpt}</span>{/if}
                </span>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .search { position: relative; flex: 0 1 17rem; min-width: 0; }
  .field-box { position: relative; display: flex; align-items: center; }
  .field-box .field { width: 100%; padding-left: 1.625rem; padding-right: 1.75rem; }
  .glass { position: absolute; left: .5rem; display: inline-flex; color: var(--muted); pointer-events: none; }
  .key { position: absolute; right: .375rem; padding: 0 .3125rem; border: 1px solid var(--line); font-family: inherit; line-height: 1.3; pointer-events: none; }
  .field:focus ~ .key { display: none; }
  .opener, .closer { display: none; }
  .results { position: absolute; left: 0; top: calc(100% + .25rem); z-index: 40; width: max(100%, 24rem); max-width: calc(100vw - 1rem);
    max-height: min(70dvh, 32rem); overflow-y: auto; padding: .25rem 0; border: 1px solid var(--line); background: var(--surface); color: var(--text);
    box-shadow: 0 .25rem 1rem rgb(0 0 0 / .15); }
  .note { margin: 0; padding: .375rem .75rem; }
  .group + .group { margin-top: .25rem; border-top: 1px solid var(--line); padding-top: .25rem; }
  .head { padding: .25rem .75rem .125rem; }
  .more { text-transform: none; letter-spacing: 0; }
  .hit { display: flex; align-items: flex-start; gap: .5rem; padding: .3125rem .75rem; cursor: pointer; }
  .hit.on { background: var(--selected-background); color: var(--pressed-color); }
  .icon { flex: none; display: inline-flex; padding-top: .125rem; color: var(--muted); }
  .hit.on .icon { color: inherit; }
  .text { min-width: 0; display: flex; flex-direction: column; }
  .label, .where, .excerpt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hit.on .where, .hit.on .excerpt { color: inherit; opacity: .75; }
  @media (pointer: coarse) { .hit { min-height: 2.75rem; align-items: center; } }
  /* A phone: an icon in the bar; open, the field covers the top bar and the results its width */
  @media (max-width: 47.9rem) {
    .search { position: static; flex: none; }
    .opener { display: inline-flex; }
    .field-box { display: none; }
    .expanded .field-box { display: flex; position: absolute; inset: 0; z-index: 30; gap: .25rem; padding: 0 .5rem; background: var(--surface-head); }
    .expanded .glass { left: 1rem; }
    .expanded .field-box .field { padding-right: .5rem; }
    .expanded .key { display: none; }
    .expanded .closer { display: inline-flex; flex: none; }
    .results { left: .5rem; right: .5rem; width: auto; max-width: none; top: calc(var(--top-height) + .25rem); }
  }
</style>
