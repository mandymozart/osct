<script lang="ts">
  import { history } from "#lib/history.svelte.js";
  import { changeTitle, promptLines, treeNames, whenWord, whoWord } from "#lib/history.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { session } from "#lib/session.svelte.js";

  /**
   * The prompt before a revert (#312) – never a browser dialog: what the plan does (the changes that go back, newest
   * first), the warnings (later edits of the same things that go with it, other people's changes, conflicts that stay,
   * changes that cannot be reverted) and the yes. Esc or *Keep* cancels. A revert, a jump back and an undo that is more
   * than taking back the person's own edit all come here (`history.pending`). Also shows the history's short notices.
   */
  const pending = $derived(history.pending);
  const lines = $derived(pending ? promptLines(pending.result) : null);
  const names = $derived(treeNames(scenes.tree).names);
  const me = $derived(session.user?.email ?? null);
  const STATUS = { revert: "goes back", conflict: "stays – changed since", "not-revertable": "cannot be reverted" } as const;
  let keep = $state<HTMLButtonElement>();
  $effect(() => {
    if (pending) keep?.focus();
  });
</script>

{#if pending && lines}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="backdrop" data-app-ui role="presentation" onkeydown={e => { if (e.key === "Escape") history.cancel(); }}>
    <div class="prompt" role="alertdialog" aria-modal="true" aria-labelledby="revert-title">
      <h2 id="revert-title">{pending.title}?</h2>
      <p>{lines.reverts}</p>
      {#if lines.later}<p class="warn">{lines.later}</p>{/if}
      {#if lines.others}<p class="warn">{lines.others}</p>{/if}
      {#if lines.conflicts}<p class="danger">{lines.conflicts}</p>{/if}
      {#if lines.skipped}<p class="muted">{lines.skipped}</p>{/if}
      <ol class="changes">
        {#each pending.result.plan.changes as c (c.id)}
          <li class:muted={c.status !== "revert"} title={c.reason ?? ""}>
            <span class="when">{whenWord(c.createdAt)}</span>
            <span class="what">{changeTitle(c, names)}{#if c.later}<em> · later edit</em>{/if}</span>
            <span class="who" class:warn={c.other}>{whoWord(c, me)}</span>
            <span class="status" class:danger={c.status === "conflict"}>{STATUS[c.status]}</span>
          </li>
        {/each}
      </ol>
      <p class="muted small">The draft only – readers see it with the next publish.</p>
      <p class="actions">
        <button type="button" class="pill primary" disabled={history.busy || !pending.result.plan.counts.revert} onclick={() => void history.confirm()}>
          {history.busy ? "Reverting…" : `Revert ${pending.result.plan.counts.revert} change${pending.result.plan.counts.revert === 1 ? "" : "s"}`}</button>
        <button type="button" class="text-link" bind:this={keep} onclick={() => history.cancel()}>Keep</button>
      </p>
    </div>
  </div>
{/if}
{#if history.notice}
  <p class="notice" role="status" data-app-ui>{history.notice}</p>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgb(0 0 0 / .35); }
  .prompt { display: grid; gap: .375rem; width: min(34rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); overflow-y: auto; padding: .75rem 1rem;
    border: 1px solid var(--line); background: var(--surface); color: var(--text); }
  h2 { margin: 0; font-size: 1rem; }
  p { margin: 0; line-height: 1.45; }
  .warn { color: var(--warn); }
  .changes { list-style: none; margin: .25rem 0; padding: 0; max-height: 16rem; overflow-y: auto; border-top: 1px solid var(--line); }
  .changes li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: .5rem; padding: .125rem 0; border-bottom: 1px solid var(--line); font-size: var(--text-small); }
  .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; margin-top: .25rem; }
  .notice { position: fixed; left: 50%; top: calc(var(--top-height) + .75rem); transform: translateX(-50%); z-index: 49; margin: 0; padding: .25rem .75rem;
    border: 1px solid var(--line); background: var(--surface); color: var(--text); pointer-events: none; }
</style>
