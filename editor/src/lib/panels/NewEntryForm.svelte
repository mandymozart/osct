<script lang="ts">
  import type { Spread } from "@engine/types";
  import { ENTRY_CATEGORIES, EntryCategory } from "@shared/types/entry";
  import { addEntry, errorText } from "#lib/api.js";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * A new entry without a printed image on the spread (the tree's "+ entry", #237): read in the reader's list only, like
   * a glossary term – its title, category and access page (one of the spread's pages). The API makes it
   * (`POST …/entries` without `target`); the caller reloads the content and selects it, so its form opens in the
   * Inspector. A target can follow on the stage.
   */
  let { bookId, spread, oncreated, oncancel }: {
    bookId: string;
    spread: Spread;
    oncreated: (entryId: string) => Promise<void>;
    oncancel: () => void;
  } = $props();

  const pages = $derived(Array.from({ length: spread.lastPage - spread.firstPage + 1 }, (_, i) => spread.firstPage + i));
  const format = $derived(spread.format ?? "spread");
  const pageLabel = (p: number) => (format === "cover" ? "cover" : format === "back" ? "back cover" : String(p));
  let title = $state("");
  // svelte-ignore state_referenced_locally
  let page = $state(spread.firstPage);
  let category = $state<EntryCategory>(EntryCategory.Glossary);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const create = async () => {
    busy = true;
    error = null;
    try {
      const { entry } = await addEntry(bookId, { title: title.trim(), page, category });
      await oncreated(entry.id);
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      busy = false;
    }
  };
</script>

<form class="form" onsubmit={e => { e.preventDefault(); void create(); }}>
  <div class="section"><span class="section-label">new entry on {spread.title}</span>
    <button type="button" class="text-link" onclick={oncancel}>cancel</button></div>
  <div class="row"><span class="label">title</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={title} placeholder="the term or the text's title" aria-label="New entry's title" autofocus /></div>
  <div class="row" data-help-name="Entry category" data-help="Where the entry is listed in the reader's consultation menu: Glossary, Videos, Texts or Links.">
    <span class="label">listed in</span>
    <span class="controls"><Segmented options={ENTRY_CATEGORIES} value={category} label="New entry's category" onchange={c => (category = c)} /></span></div>
  {#if pages.length > 1}
    <div class="row" data-help-name="Access page" data-help="The page the entry belongs to – it decides the spread, and the reader's list names it.">
      <span class="label">page</span>
      <span class="controls"><Segmented options={pages.map(String)} value={String(page)} labels={Object.fromEntries(pages.map(p => [String(p), pageLabel(p)]))} onchange={p => (page = Number(p))} /></span></div>
  {/if}
  <div class="actions">
    <span class="grow"></span>
    {#if error}<span class="small danger">{error}</span>{/if}
    <button type="submit" class="pill primary" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create entry"}</button>
  </div>
</form>

<style>
  .form { display: flex; flex-direction: column; gap: .125rem; }
  .row > .field { width: 100%; }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
</style>
