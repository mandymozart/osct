<script lang="ts">
  import { onMount } from "svelte";
  import { deleteFilesLabel, elsewhereLine, filesLine, keptEntitiesLine, onlyHereNames, pagesLine, removalHeadline, removeLabel, type RemovalStep } from "#lib/removal.js";

  /**
   * The in-page confirmation of a removal with everything on it (#198): what the API's impact says goes – the
   * entries, targets and entities, the later pages that move back, the shared entities kept – and the Library files:
   * kept, unless the person turns on the option to delete the files used only here (off at first); files used
   * elsewhere are listed as kept. Confirm sends the confirmation id back (the page does that in `onconfirm`); Keep or
   * Esc cancels. Used by the book page's spread menu and the spread's tree for an entry – never a browser dialog.
   */
  let { step, busy = false, error = null, onconfirm, oncancel }: {
    step: RemovalStep;
    busy?: boolean;
    error?: string | null;
    onconfirm: (deleteFiles: boolean) => void;
    oncancel: () => void;
  } = $props();

  let deleteFiles = $state(false);
  let keepButton = $state<HTMLButtonElement>();
  const impact = $derived(step.impact);
  const optionLabel = $derived(deleteFilesLabel(impact));

  onMount(() => keepButton?.focus());
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="removal small" role="group" aria-label={removalHeadline(impact)} onkeydown={e => { if (e.key === "Escape") oncancel(); }}>
  {#if step.changed}<p class="danger" role="alert">The book changed since – this is what the removal takes now.</p>{/if}
  <p class="headline" role="alert">{removalHeadline(impact)}</p>
  {#if pagesLine(impact)}<p class="muted">{pagesLine(impact)}</p>{/if}
  {#if keptEntitiesLine(impact)}<p class="muted">{keptEntitiesLine(impact)}</p>{/if}
  <p>{filesLine(impact, deleteFiles)}</p>
  {#if optionLabel}
    <button type="button" class="pill framed option" class:on={deleteFiles} aria-pressed={deleteFiles} disabled={busy}
      onclick={() => (deleteFiles = !deleteFiles)}
      data-help-name="Delete the files" data-help="Also deletes the Library files only this removal used – from the Library and the content store. Off by default; files used elsewhere are never deleted.">{optionLabel}</button>
    <p class="muted names">{onlyHereNames(impact)}</p>
  {/if}
  {#if elsewhereLine(impact)}<p class="muted">{elsewhereLine(impact)}</p>{/if}
  {#if error}<p class="danger">{error}</p>{/if}
  <p class="actions">
    <button type="button" class="pill primary danger" disabled={busy} onclick={() => onconfirm(deleteFiles)}>{busy ? "Removing…" : removeLabel(impact)}</button>
    <button type="button" class="text-link" bind:this={keepButton} onclick={oncancel}>Keep</button>
  </p>
</section>

<style>
  .removal { display: grid; gap: .375rem; justify-items: start; padding: .5rem 0; }
  .removal p { margin: 0; line-height: 1.45; overflow-wrap: anywhere; }
  .headline { font-weight: 600; }
  .option { white-space: normal; text-align: left; min-height: var(--control-height); height: auto; padding-block: .25rem; max-width: 100%; }
  .names { margin-top: -.125rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; margin-top: .125rem; }
</style>
