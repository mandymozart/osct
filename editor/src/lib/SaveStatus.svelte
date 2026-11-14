<script lang="ts">
  import { autosave } from "#lib/autosave.svelte.js";

  /**
   * Where the draft stands, in the top bar (#259): edits reach the draft by themselves, so this is the one place that
   * says whether they have – *Saving…* while a save waits or runs, *Saved* after one, *Not saved* with what keeps it
   * back: a failed save (its words, and **Retry**) or a subject that cannot be saved as it stands (a rule that is not
   * complete yet). Nothing before the first edit.
   */
  const HELP = "Edits reach the draft by themselves, a moment after the last change – there is no Save. Readers get the draft with Publish.";
  const status = $derived(autosave.status);
  const detail = $derived(status.state === "failed" ? status.message : status.state === "held" ? status.reason : "");
</script>

{#if status.state !== "idle"}
  <span class="save-status small" class:danger={status.state === "failed" || status.state === "held"} class:muted={status.state === "saving" || status.state === "saved"}
    role="status" data-help-name="Saved" data-help={HELP} title={detail || HELP}>
    {#if status.state === "saving"}Saving…{:else if status.state === "saved"}Saved{:else}Not saved <span class="detail">– {detail}</span>{/if}
  </span>
  {#if status.state === "failed"}<button type="button" class="text-link retry" onclick={() => autosave.retry()}>Retry</button>{/if}
{/if}

<style>
  .save-status { flex: 0 1 auto; min-width: 0; max-width: 24rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .retry { flex: none; }
  /* A phone's bar has room for the state alone: its reason is the title */
  @media (max-width: 47.9rem) {
    .detail { display: none; }
  }
</style>
