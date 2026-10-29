<script lang="ts">
  import { onMount } from "svelte";
  import { getEntityRef } from "@engine/content/game-config";
  import type { Target } from "@engine/types";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import { getPreview, setTargetHidden, subscribePreview, type PreviewState } from "$lib/stage/preview";
  import Icon from "$lib/components/Icon.svelte";

  /**
   * The spread as a tree (a 3D tool's outliner): the spread, its entries in page order, each entry's target and the
   * target's entity. A target row shows found (◉ / ○ – the toggle reports it lost or found, as the Stage panel's
   * chips) and ● while the stage shows it with other values than the draft's; a tap on a target or its entity
   * selects it for the Entity panel, a tap on the stage selects here. Folding is per entry and not stored.
   */
  let { stage, spreadId, selected = $bindable(), onselect }: {
    stage: Stage | null; spreadId: string; selected: string | null; onselect?: (targetId: string) => void;
  } = $props();

  const spread = $derived(content.spread(spreadId));
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  let folded = $state<Record<string, boolean>>({});
  const fold = (entryId: string) => (folded = { ...folded, [entryId]: !folded[entryId] });

  const pick = (target: Target) => {
    if (!target.entity) return;
    selected = target.id;
    onselect?.(target.id);
  };
  const sourceOf = (target: Target) => {
    const ref = getEntityRef(target.id);
    return ref ? `shared ${ref}` : "own";
  };
</script>

{#if !spread}
  <p class="muted small">No spread.</p>
{:else}
  <div class="tree" role="tree" aria-label="Spread tree">
    <div class="node root" role="treeitem" aria-expanded="true" aria-selected="false">
      <span class="name">{spread.title}</span>
      <span class="small muted">{spread.firstPage}{spread.lastPage !== spread.firstPage ? `–${spread.lastPage}` : ""}</span>
    </div>
    {#each spread.entries as entry (entry.id)}
      {@const target = entry.target}
      {@const open = !folded[entry.id]}
      <div class="node depth-1" role="treeitem" aria-expanded={target ? open : undefined} aria-selected="false">
        {#if target}
          <button type="button" class="fold" onclick={() => fold(entry.id)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
        {:else}
          <span class="fold"></span>
        {/if}
        <span class="small muted kind">{entry.category}</span>
        <span class="name" title={entry.title}>{entry.title}</span>
        <span class="small muted">p.{entry.page}</span>
      </div>
      {#if target && open}
        {@const found = stage?.found.includes(target.id)}
        {@const shown = !preview.hidden.includes(target.id)}
        {@const on = selected === target.id}
        <div class="node depth-2" class:on role="treeitem" aria-selected={on}>
          <button type="button" class="fold mark" aria-pressed={shown} title={shown ? "Found – tap to lose" : "Lost – tap to find"} onclick={() => setTargetHidden(target.id, shown)}>{found ? "◉" : "○"}</button>
          <button type="button" class="pick" disabled={!target.entity} onclick={() => pick(target)} title={target.entity ? "Edit this target's entity" : "No AR content"}>
            <span class="small muted kind">target</span>
            <span class="name">{target.id}</span>
            {#if stage?.overrideOf(target.id)}<span class="small" title="Shown with other values than the draft's">●</span>{/if}
          </button>
        </div>
        {#if target.entity}
          <div class="node depth-3" class:on role="treeitem" aria-selected={on}>
            <span class="fold"></span>
            <button type="button" class="pick" onclick={() => pick(target)} title="Edit this entity">
              <span class="small muted kind">{target.entity.type}</span>
              <span class="name">{sourceOf(target)}</span>
            </button>
          </div>
        {/if}
      {/if}
    {/each}
  </div>
{/if}

<style>
  .tree { display: flex; flex-direction: column; }
  .node { display: flex; align-items: center; gap: .375rem; min-height: 1.5rem; padding-right: .375rem; border-radius: var(--control-radius); }
  .node.on { background: var(--pressed-background); color: var(--pressed-color); }
  .root { padding-left: .375rem; min-height: var(--control-height); }
  .depth-1 { padding-left: .375rem; }
  .depth-2 { padding-left: 1.5rem; }
  .depth-3 { padding-left: 2.625rem; }
  .fold { flex: none; width: 1.125rem; height: 1.5rem; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; background: none; color: var(--muted); border-radius: var(--control-radius); }
  button.fold { cursor: pointer; }
  button.fold:hover { background: var(--hover-background); color: var(--text); }
  .mark { font-size: .9em; }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: .375rem; height: 1.5rem; padding: 0; border: none; background: none; text-align: left; cursor: pointer; }
  .pick:disabled { cursor: default; color: var(--muted); }
  .pick:not(:disabled):hover .name { text-decoration: underline; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kind { flex: none; min-width: 3rem; letter-spacing: .04em; text-transform: uppercase; font-size: .625rem; }
</style>
