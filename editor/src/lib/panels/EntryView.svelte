<script lang="ts">
  import type { Entry } from "@engine/types";
  import { entryLink, entryParagraphs, entryRows } from "#lib/entry-view.js";
  import { fileNameOf } from "#lib/library-place.js";

  /**
   * An entry selected in the tree (#227), in the Inspector's place: its meta rows (category, title, access page,
   * author, tags), the body in the reader's paragraphs, the image, a link's URL and its target with *select the target*.
   * Read-only: content editing (#223) turns these rows into its form here, in the same place and order.
   */
  let { entry, onselecttarget }: {
    entry: Entry;
    /** *select the target*: the tree, the stage and the panel go to the entry's target (one with a printed image) */
    onselecttarget?: (targetId: string) => void;
  } = $props();

  const rows = $derived(entryRows(entry));
  const paragraphs = $derived(entryParagraphs(entry.body ?? ""));
  const link = $derived(entryLink(entry.media));
</script>

<div class="section" data-help-name="Entry" data-help="The entry as the reader reads it in the list – its fields, its text in paragraphs, its image and link, and its target. Read-only for now.">
  <span class="section-label">entry · {entry.title}</span>
</div>
{#each rows as row (row.label)}
  <div class="row"><span class="label">{row.label}</span><span class="value">{row.value}</span></div>
{/each}
<div class="row top"><span class="label">text</span>
  <div class="body">
    {#each paragraphs as paragraph, i (i)}<p>{paragraph}</p>{:else}<span class="small muted">none</span>{/each}
  </div></div>
{#if entry.image}
  <div class="row top"><span class="label">image</span>
    <span class="picture"><img src={entry.image} alt="" loading="lazy" /><span class="small muted name" title={entry.image}>{fileNameOf(entry.image)}</span></span></div>
{/if}
{#if entry.media}
  <div class="row"><span class="label">link</span>
    {#if link}<a class="value url" href={link} target="_blank" rel="noopener noreferrer" title="Opens the link in a new tab">{entry.media}</a>
    {:else}<span class="value url">{entry.media}</span>{/if}</div>
{/if}
<div class="row"><span class="label">target</span>
  <span class="controls">
    {#if entry.target}
      <span class="value">{entry.target.id}</span>
      {#if entry.target.imageSrc && onselecttarget}
        {@const targetId = entry.target.id}
        <button type="button" class="text-link" onclick={() => onselecttarget(targetId)}
          data-help-name="Select the target" data-help="Selects the entry's target: the tree highlights its row, the Inspector shows its printed image and placement, the stage outlines its print.">select the target</button>
      {/if}
    {:else}
      <span class="small muted">none – read in the list only</span>
    {/if}
  </span></div>

<style>
  .row.top { align-items: start; }
  .row.top > .label { line-height: var(--control-height); }
  .value { min-width: 0; overflow-wrap: anywhere; }
  .body { min-width: 0; padding: .3rem 0; }
  .body p { margin: 0 0 .5rem; white-space: pre-line; overflow-wrap: anywhere; }
  .body p:last-child { margin-bottom: 0; }
  .picture { display: flex; flex-direction: column; align-items: flex-start; gap: .25rem; min-width: 0; padding: .25rem 0; }
  .picture img { max-width: 100%; max-height: 10rem; object-fit: contain; border: 1px solid var(--line); }
  .name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url { color: var(--text); }
</style>
