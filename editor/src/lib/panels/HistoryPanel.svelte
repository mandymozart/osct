<script lang="ts">
  import { history } from "#lib/history.svelte.js";
  import { changeSummary, changeTitle, filterChanges, filterChoices, kindWord, treeNames, whenWord, whoWord, type HistoryFilter } from "#lib/history.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { session } from "#lib/session.svelte.js";
  import { autosave } from "#lib/autosave.svelte.js";

  /**
   * The **History** (#312): every saved change of the experience, newest first (`GET …/changes`, the newest 500) – when,
   * who, what (the kind and its scene, entry or target in words) and a before → after line. Filters by scene, kind and
   * person. Each change offers *Revert* (its before written back as a new change, later edits of the same thing with it)
   * and *Jump back to here* (every later change reverted, newest first, as one change set); both ask first
   * (`RevertPrompt.svelte`). A change the log cannot take back says why instead. A revert names the change it took back.
   */
  let { current }: { current?: string } = $props();

  let filter = $state<HistoryFilter>({ scene: null, kind: null, person: null });
  /** The rows open to their before → after line in full */
  let open = $state<string | null>(null);

  // The log follows the saves: read again once the autosaver says saved (and when the panel opens)
  $effect(() => {
    if (autosave.status.state === "saved" || autosave.status.state === "idle") void history.load().catch(() => undefined);
  });

  const tree = $derived(scenes.tree);
  const known = $derived(treeNames(tree));
  const names = $derived(known.names);
  const choices = $derived(filterChoices(history.changes));
  const shown = $derived(filterChanges(history.changes, filter, known.scenesOf));
  const me = $derived(session.user?.email ?? null);
  const byId = $derived(new Map(history.changes.map(c => [c.id, c])));
  const sceneChoices = $derived(tree?.scenes ?? []);
</script>

<div class="history">
  <div class="filters" role="group" aria-label="History filters">
    <select aria-label="Scene" title="Only the changes of this scene (its entries, targets and entities)" bind:value={filter.scene}>
      <option value={null}>All scenes</option>
      {#if current}<option value={current}>This scene</option>{/if}
      {#each sceneChoices as s (s.id)}<option value={s.id}>{s.label || s.id}</option>{/each}
    </select>
    <select aria-label="Kind" bind:value={filter.kind}>
      <option value={null}>All kinds</option>
      {#each choices.kinds as k (k)}<option value={k}>{kindWord(k)}</option>{/each}
    </select>
    <select aria-label="Person" bind:value={filter.person}>
      <option value={null}>Everyone</option>
      {#each choices.people as p (p)}<option value={p}>{p === me ? "You" : p}</option>{/each}
    </select>
  </div>
  {#if history.error}<p class="danger small">{history.error}</p>{/if}
  {#if !history.changes.length}
    <p class="muted small">{history.loading ? "Reading the history…" : "No saved changes yet."}</p>
  {:else if !shown.length}
    <p class="muted small">No change matches the filters.</p>
  {/if}
  <ol class="rows">
    {#each shown as c (c.id)}
      {@const reverted = c.reverts ? byId.get(c.reverts) : undefined}
      <li class="change" class:other={c.user !== me}>
        <button type="button" class="line" aria-expanded={open === c.id} onclick={() => (open = open === c.id ? null : c.id)}
          title="{new Date(c.createdAt).toLocaleString('en-GB')} – {c.user ?? 'someone'}{c.token ? ` through ${c.token}` : ''}">
          <span class="when muted">{whenWord(c.createdAt)}</span>
          <span class="what">{changeTitle(c, names)}{#if c.reverts}<span class="tag">revert</span>{/if}</span>
          <span class="who muted">{whoWord(c, me)}</span>
        </button>
        <p class="summary muted" class:full={open === c.id}>{reverted ? `takes back ${whenWord(reverted.createdAt)}: ` : ""}{changeSummary(c)}</p>
        {#if open === c.id}
          <p class="actions">
            {#if c.notRevertable}
              <span class="muted small">Not revertable: {c.notRevertable}</span>
            {:else}
              <button type="button" class="pill" disabled={history.busy} onclick={() => void history.askRevert(c)}
                data-help-name="Revert this change" data-help="Writes this change's before back as a new change – asks first, and lists later edits of the same thing and other people's changes.">Revert</button>
            {/if}
            {#if c !== history.changes[0]}
              <button type="button" class="pill" disabled={history.busy} onclick={() => void history.askJump(c)}
                data-help-name="Jump back to here" data-help="Reverts every change saved after this one, newest first, as one change set – asks first and lists what changes.">Jump back to here</button>
            {/if}
          </p>
        {/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .history { display: flex; flex-direction: column; gap: .375rem; min-height: 0; flex: 1; padding: .375rem .5rem .75rem; overflow-y: auto; }
  .filters { display: flex; flex-wrap: wrap; gap: .25rem; }
  .filters select { flex: 1 1 6rem; min-width: 0; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .change { border-bottom: 1px solid var(--line); padding: .125rem 0 .25rem; }
  .line { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .5rem; align-items: baseline; width: 100%; padding: .125rem 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  @media (hover: hover) {
    .line:hover { background: var(--hover-background); }
  }
  .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when, .who { font-size: var(--text-small); white-space: nowrap; }
  .tag { margin-left: .375rem; padding: 0 .25rem; border: 1px solid var(--line); font-size: var(--text-small); color: var(--muted); }
  .summary { margin: 0; font-size: var(--text-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, Consolas, monospace; }
  .summary.full { white-space: normal; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: .25rem; align-items: center; margin: .25rem 0 0; }
  .change.other .who { color: var(--warn); }
</style>
