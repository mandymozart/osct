<script lang="ts">
  import { onMount } from "svelte";
  import type { ImportComparison } from "#lib/api.js";
  import { comparisonRows, confirmLabel, editLabel, editsLine, importedLine, liveLine, sourcesLine } from "#lib/import-compare.js";

  /**
   * The import's comparison before it replaces a draft (#183, #348 – a book's *Replace…*): what comes in against what the
   * draft is based on and holds, its edits since that would be lost, where it is live – and the confirm. Readers keep the
   * live version until the next publish. The person confirms here, never in a browser dialog; Esc cancels.
   */
  let { comparison, changed = false, busy = false, error = null, onconfirm, oncancel }: {
    comparison: ImportComparison;
    /** The draft or the incoming content changed since the first comparison (409 confirmation-void) */
    changed?: boolean;
    busy?: boolean;
    error?: string | null;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let element = $state<HTMLElement | null>(null);
  onMount(() => element?.querySelector<HTMLButtonElement>("button.primary")?.focus());
  const c = $derived(comparison);
  const sources = $derived(sourcesLine(c));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="compare" aria-label="Compare before replacing" bind:this={element} onkeydown={e => { if (e.key === "Escape") { e.stopPropagation(); oncancel(); } }}>
  {#if changed}<p class="danger small" role="alert">The draft or the incoming content changed since – compare again.</p>{/if}
  <table class="rows">
    <thead><tr><th></th><th scope="col">Coming in</th><th scope="col">Draft</th></tr></thead>
    <tbody>
      {#each comparisonRows(c) as row (row.label)}
        <tr class:differs={row.differs}><th scope="row">{row.label}</th><td>{row.incoming}</td><td>{row.draft}</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="small muted">{importedLine(c)}</p>
  <p class:danger={c.draft.edits > 0}>{editsLine(c)}</p>
  {#if c.draft.recentEdits.length}
    <ul class="edits small muted">
      {#each c.draft.recentEdits.slice(0, 5) as edit, i (i)}<li>{editLabel(edit)}</li>{/each}
      {#if c.draft.edits > 5}<li>… and {c.draft.edits - 5} more</li>{/if}
    </ul>
  {/if}
  {#if sources}<p class="small">{sources}</p>{/if}
  <p class="small">{liveLine(c)}</p>
  <p class="small muted">Readers keep the live version until you publish.</p>
  {#if error}<p class="danger small" role="alert">{error}</p>{/if}
  <p class="actions">
    <button type="button" class="pill primary" onclick={onconfirm} disabled={busy}>{busy ? "Replacing…" : confirmLabel(c)}</button>
    <button type="button" class="text-link" onclick={oncancel}>Cancel</button>
  </p>
</section>

<style>
  .compare { display: grid; gap: .75rem; }
  p { margin: 0; line-height: 1.45; }
  .rows { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .rows th, .rows td { padding: .3125rem .5rem .3125rem 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  .rows thead th { color: var(--muted); font-size: var(--text-small); font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
  .rows tbody th { color: var(--muted); font-weight: 400; white-space: nowrap; }
  .rows tr.differs td { font-weight: 600; }
  .edits { margin: -.375rem 0 0; padding-left: 1rem; line-height: 1.5; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
  .actions .pill { min-height: 2.125rem; height: auto; padding: .375rem 1.25rem; }
</style>
