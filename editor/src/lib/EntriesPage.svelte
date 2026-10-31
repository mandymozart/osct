<script lang="ts">
  import { untrack } from "svelte";
  import { ENTRY_CATEGORIES, EntryCategory } from "@shared/types/entry";
  import { addEntry, errorText } from "#lib/api.js";
  import { entries } from "#lib/entries.svelte.js";
  import { ENTRY_FILTERS, filterCounts, filterEntries, groupEntries, type EntryFilter } from "#lib/entry-edit.js";
  import { library } from "#lib/library.svelte.js";
  import type { LibraryPick } from "#lib/library-pick.js";
  import EntryForm from "#lib/panels/EntryForm.svelte";
  import LibraryPanel from "#lib/panels/LibraryPanel.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The book's entries in one list (#223), next to the spreads on the book page: filtered by category, searched, the
   * glossary grouped by first letter as the reader groups it. Opening one shows its form (`EntryForm`, the Inspector's)
   * beside the list – on a phone instead of it. **+ entry** makes one without a target: an entry read only in the list.
   * No stage here: the preview shows every variable as not set (the spread's Inspector shows their values).
   */
  let { bookId, assetsBase = null, onchanged }: {
    bookId: string;
    assetsBase?: string | null;
    /** The draft changed (an entry saved or added) */
    onchanged?: () => void;
  } = $props();

  // The list read fresh when the page opens (others may have edited meanwhile)
  $effect(() => {
    const id = bookId;
    untrack(() => void entries.load(id));
  });
  $effect(() => {
    if (library.bookId !== bookId) void library.load(bookId);
  });

  let filter = $state<EntryFilter>("all");
  let query = $state("");
  let openId = $state<string | null>(null);
  const shown = $derived(filterEntries(entries.list, filter, query));
  const groups = $derived(groupEntries(shown, filter));
  const counts = $derived(filterCounts(entries.list));
  const open = $derived(entries.byId(openId));
  const LABELS: Record<EntryFilter, string> = { all: "all", glossary: "glossary", video: "videos", text: "texts", link: "links" };
  const labels = $derived(Object.fromEntries(ENTRY_FILTERS.map(f => [f, `${LABELS[f]} ${counts[f]}`])) as Record<EntryFilter, string>);

  // ── a new entry without a target ──
  let adding = $state(false);
  let newTitle = $state("");
  let newCategory = $state<EntryCategory>(EntryCategory.Glossary);
  let newPage = $state(1);
  let busy = $state(false);
  let addError = $state<string | null>(null);
  const add = async () => {
    busy = true;
    addError = null;
    try {
      const { entry } = await addEntry(bookId, { title: newTitle.trim(), page: newPage, category: newCategory });
      await entries.load(bookId);
      adding = false;
      newTitle = "";
      openId = entry.id;
      onchanged?.();
    } catch (e) {
      addError = errorText(e);
    } finally {
      busy = false;
    }
  };

  let picking = $state<LibraryPick | null>(null);
  const pickFor = (pick: Omit<LibraryPick, "oncancel">) => {
    picking = { ...pick, onpick: asset => { picking = null; return pick.onpick(asset); }, oncancel: () => (picking = null) };
  };
  $effect(() => {
    void openId;
    picking = null;
  });
</script>

<div class="entries-page" class:has-open={!!open}>
  <section class="list" aria-label="Entries">
    <div class="tools">
      <Segmented options={ENTRY_FILTERS} value={filter} {labels} label="Category" onchange={f => (filter = f)} />
      <input class="field search" type="search" placeholder="Search titles, texts, tags" aria-label="Search the entries" bind:value={query}
        data-help="Finds the entries whose title, text, author, tags or id hold every word – accents and case do not matter." />
      <button type="button" class="pill framed" onclick={() => (adding = !adding)} aria-expanded={adding}
        data-help-name="+ entry" data-help="A new entry without a target – read only in the list, like a glossary term. Its page decides the spread; a target can follow on the spread's stage."><Icon name="plus" />entry</button>
    </div>
    {#if adding}
      <form class="new" onsubmit={e => { e.preventDefault(); void add(); }}>
        <div class="row"><span class="label">title</span><input class="field" bind:value={newTitle} aria-label="New entry's title" required /></div>
        <div class="row"><span class="label">category</span><span class="controls"><Segmented options={ENTRY_CATEGORIES} value={newCategory} label="New entry's category" onchange={c => (newCategory = c)} /></span></div>
        <div class="row"><span class="label">access page</span><span class="w"><ScrubNumber value={newPage} min={0} step={1} prefix="p." label="new entry's access page" oninput={p => (newPage = Math.round(p))} /></span></div>
        <div class="actions">
          <button type="button" class="text-link" onclick={() => (adding = false)}>Cancel</button>
          <span class="grow"></span>
          {#if addError}<span class="small danger">{addError}</span>{/if}
          <button type="submit" class="pill primary" disabled={busy || !newTitle.trim()}>{busy ? "Adding…" : "Add"}</button>
        </div>
      </form>
    {/if}
    {#if entries.error}<p class="small danger">{entries.error}</p>{/if}
    {#if entries.loading && !entries.list.length}
      <p class="small muted">Loading…</p>
    {:else if !shown.length}
      <p class="small muted">{entries.list.length ? "No entry matches." : "No entries yet."}</p>
    {:else}
      <ul class="rows">
        {#each groups as group, g (group.letter ?? `none-${g}`)}
          {#if group.letter}<li class="letter" aria-hidden="true">{group.letter}</li>{/if}
          {#each group.entries as entry (entry.id)}
            <li>
              <button type="button" class="entry" class:on={entry.id === openId} aria-pressed={entry.id === openId} onclick={() => (openId = entry.id)}
                title="{entry.category} · p. {entry.page}{entry.target ? ' · with a target' : ' · read in the list only'}">
                <span class="title">{entry.title}</span>
                <span class="meta small muted">
                  {#if filter === "all"}<span>{entry.category}</span>{/if}
                  <span>p. {entry.page}</span>
                  {#if entry.target}<Icon name="target" size="1em" />{/if}
                </span>
              </button>
            </li>
          {/each}
        {/each}
      </ul>
    {/if}
  </section>
  {#if open}
    <section class="form" aria-label="Entry {open.title}">
      <button type="button" class="text-link back" onclick={() => (openId = null)}>‹ all entries</button>
      {#if picking}<LibraryPanel {bookId} pick={picking} />{/if}
      <div hidden={!!picking}>
        <EntryForm {bookId} entry={open} {assetsBase} vars={null} onpick={pickFor} onsaved={() => onchanged?.()} />
      </div>
    </section>
  {/if}
</div>

<style>
  .entries-page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
  @media (min-width: 60rem) {
    .entries-page.has-open { grid-template-columns: minmax(0, 1fr) minmax(20rem, 30rem); }
    .back { display: none; }
  }
  @media (max-width: 59.9rem) {
    .has-open .list { display: none; }
  }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: .375rem .5rem; margin-bottom: .5rem; }
  .search { flex: 1 1 12rem; min-width: 0; }
  .new { max-width: 30rem; margin-bottom: .75rem; padding: .5rem; border: 1px solid var(--line); }
  .new .row > .field { width: 100%; }
  .w { width: 7rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .25rem; }
  .grow { flex: 1; }
  .rows { list-style: none; margin: 0; padding: 0; }
  .letter { margin-top: .75rem; padding: .125rem .5rem; color: var(--muted); font-size: var(--text-small); letter-spacing: .08em; border-bottom: 1px solid var(--line); }
  .entry { display: flex; align-items: center; gap: .5rem; width: 100%; min-height: var(--control-height); padding: .25rem .5rem; border: none; border-radius: var(--control-radius);
    background: none; text-align: left; cursor: pointer; }
  @media (hover: hover) { .entry:hover { background: var(--hover-background); } }
  .entry.on { background: var(--selected-background); color: var(--pressed-color); }
  @media (pointer: coarse) { .entry { min-height: 2.75rem; } }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: inline-flex; align-items: center; gap: .5rem; white-space: nowrap; }
  .form { min-width: 0; border-left: 1px solid var(--line); padding-left: 1rem; position: sticky; top: calc(var(--top-height) + .5rem); max-height: calc(100dvh - var(--top-height) - 1rem); overflow: auto; }
  @media (max-width: 59.9rem) { .form { border-left: none; padding-left: 0; position: static; max-height: none; } }
  .back { margin-bottom: .5rem; }
</style>
