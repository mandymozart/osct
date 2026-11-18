<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import { history } from "#lib/history.svelte.js";
  import { undoKey } from "#lib/history.js";

  /**
   * Undo, redo and the History (#312): a group of the stage toolbar. ↶ takes back the newest step of the person's own
   * saved changes since the page opened, ↷ puts it back (`history.svelte.ts`); Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y do the
   * same – not while a text field or the code editor has the focus (they keep their own undo). The clock opens the
   * History panel (`onhistory`), where any saved change can be reverted or the draft taken back to a point.
   */
  let { onhistory }: { onhistory?: () => void } = $props();

  const onKey = (event: KeyboardEvent) => {
    const which = undoKey(event);
    if (!which) return;
    event.preventDefault();
    void (which === "undo" ? history.undo() : history.redo());
  };
</script>

<svelte:window onkeydown={onKey} />

<span class="tool-group undo" role="group" aria-label="Undo and history">
  <button type="button" class="icon-button" disabled={history.busy} onclick={() => void history.undo()} aria-label="Undo" title="Undo (Ctrl+Z) – your last saved change"
    data-help-name="Undo" data-help="Takes back your newest saved change of this session – a field, a drag, a move of scenes; an autosaved burst is one step. It is written back as a new change, so nothing is lost. When other people's changes or later edits are in the way it asks first."><Icon name="undo" /></button>
  <button type="button" class="icon-button" disabled={history.busy || !history.canRedo} onclick={() => void history.redo()} aria-label="Redo" title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
    data-help-name="Redo" data-help="Puts back what Undo took back – until you edit something new."><Icon name="redo" /></button>
  {#if onhistory}
    <button type="button" class="icon-button" onclick={onhistory} aria-label="History" title="History – every saved change of the experience"
      data-help-name="History" data-help="Opens the History panel: every saved change of the experience with who and when, filtered by scene, kind or person – revert one, or jump back to a point."><Icon name="history" /></button>
  {/if}
</span>

<style>
  .undo { display: flex; gap: .125rem; }
</style>
