<script lang="ts">
  import { onMount } from "svelte";
  import { getEntityRef } from "@engine/content/game-config";
  import type { Entry, Target } from "@engine/types";
  import { content } from "$lib/content.svelte";
  import type { Stage } from "$lib/stage/stage.svelte";
  import { getPreview, setTargetHidden, subscribePreview, type PreviewState } from "$lib/stage/preview";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";

  /**
   * The spread as a tree in the style of Blender's outliner: a chevron column, a type icon before every name, guide
   * lines per depth, zebra rows, the eye in a column at the right (shown = found, off = reported lost – the Stage
   * panel's chips do the same), the selected row highlighted over its whole width. Rows: the spread, its entries in
   * page order, each entry's target, the target's entity. A tap on a target or its entity selects it for the Entity
   * panel (a tap on the stage selects here too); ↑ ↓ walk the targets, ← → fold and unfold, Enter selects. Folding
   * is per entry and not stored. ● after a name: the stage shows it with other values than the draft's.
   */
  let { stage, spreadId, selected = $bindable(), onselect }: {
    stage: Stage | null; spreadId: string; selected: string | null; onselect?: (targetId: string) => void;
  } = $props();

  const spread = $derived(content.spread(spreadId));
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  let folded = $state<Record<string, boolean>>({});
  const fold = (entryId: string, to?: boolean) => (folded = { ...folded, [entryId]: to ?? !folded[entryId] });

  /** The targets that can be selected (with AR content), in tree order */
  const selectable = $derived((spread?.entries ?? []).map(entry => entry.target).filter((t): t is Target => !!t?.entity));

  const pick = (target: Target) => {
    if (!target.entity) return;
    selected = target.id;
    onselect?.(target.id);
  };
  const entityIcon = (target: Target): IconName => (target.entity?.type === "model" ? "model" : target.entity?.type === "video" ? "video" : "image");
  const entityName = (target: Target) => {
    const ref = getEntityRef(target.id);
    return `${target.entity?.type}${ref ? ` · ${ref}` : ""}`;
  };
  const entryOf = (targetId: string): Entry | undefined => spread?.entries.find(entry => entry.target?.id === targetId);

  const onKey = (event: KeyboardEvent) => {
    const index = selectable.findIndex(t => t.id === selected);
    const entry = selected ? entryOf(selected) : undefined;
    switch (event.key) {
      case "ArrowDown": pick(selectable[Math.min(selectable.length - 1, index + 1)] ?? selectable[0]); break;
      case "ArrowUp": pick(selectable[Math.max(0, index - 1)] ?? selectable[0]); break;
      case "ArrowLeft": if (entry) fold(entry.id, true); break;
      case "ArrowRight": if (entry) fold(entry.id, false); break;
      case "Enter": case " ": if (index >= 0) onselect?.(selected!); break;
      default: return;
    }
    event.preventDefault();
  };
</script>

{#if !spread}
  <p class="muted small">No spread.</p>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="tree" role="tree" aria-label="Spread tree" tabindex="0" onkeydown={onKey}>
    <div class="node" role="treeitem" aria-expanded="true" aria-selected="false">
      <span class="chevron"><Icon name="down" size="1em" /></span>
      <span class="type"><Icon name="book" size="1em" stroke={2} /></span>
      <span class="name">{spread.title}</span>
      <span class="small muted">{spread.firstPage}{spread.lastPage !== spread.firstPage ? `–${spread.lastPage}` : ""}</span>
      <span class="eye"></span>
    </div>
    {#each spread.entries as entry (entry.id)}
      {@const target = entry.target}
      {@const open = !folded[entry.id]}
      {@const shown = !!target && !preview.hidden.includes(target.id)}
      {@const on = !!target && selected === target.id}
      <div class="node depth-1" class:on role="treeitem" aria-expanded={target ? open : undefined} aria-selected={on}>
        <span class="guide g1"></span>
        {#if target}
          <button type="button" class="chevron" onclick={() => fold(entry.id)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
        {:else}
          <span class="chevron"></span>
        {/if}
        <span class="type"><Icon name="entry" size="1em" stroke={2} /></span>
        <button type="button" class="pick" class:muted={!!target && !shown} disabled={!target?.entity} onclick={() => target && pick(target)} title="{entry.category} · p.{entry.page}{target?.entity ? '' : ' – no AR content'}">
          <span class="name">{entry.title}</span>
        </button>
        {#if target}
          <button type="button" class="eye" aria-pressed={shown} title={shown ? "Found – tap to lose" : "Lost – tap to find"} aria-label="Found" onclick={() => setTargetHidden(target.id, shown)}><Icon name={shown ? "eye" : "eye-off"} size="1em" stroke={2} /></button>
        {:else}
          <span class="eye"></span>
        {/if}
      </div>
      {#if target && open}
        <div class="node depth-2" class:on role="treeitem" aria-selected={on}>
          <span class="guide g1"></span><span class="guide g2"></span>
          <span class="chevron"></span>
          <span class="type"><Icon name="target" size="1em" stroke={2} /></span>
          <button type="button" class="pick" class:muted={!shown} disabled={!target.entity} onclick={() => pick(target)} title={target.entity ? "Edit this target's entity" : "No AR content"}>
            <span class="name">{target.id}</span>
            {#if stage?.found.includes(target.id)}<span class="small muted" title="In view now">in view</span>{/if}
            {#if stage?.overrideOf(target.id)}<span class="dot" title="Shown with other values than the draft's">●</span>{/if}
          </button>
          <span class="eye"></span>
        </div>
        {#if target.entity}
          <div class="node depth-3" class:on role="treeitem" aria-selected={on}>
            <span class="guide g1"></span><span class="guide g2"></span><span class="guide g3"></span>
            <span class="chevron"></span>
            <span class="type"><Icon name={entityIcon(target)} size="1em" stroke={2} /></span>
            <button type="button" class="pick" class:muted={!shown} onclick={() => pick(target)} title="Edit this entity">
              <span class="name">{entityName(target)}</span>
            </button>
            <span class="eye"></span>
          </div>
        {/if}
      {/if}
    {/each}
  </div>
{/if}

<style>
  .tree { display: flex; flex-direction: column; --indent: 1.125rem; --cell: 1.125rem; outline: none; }
  .tree:focus-visible .node.on { box-shadow: inset 0 0 0 1px var(--text); }
  .node { position: relative; display: flex; align-items: center; gap: .25rem; height: 1.5rem; padding: 0 .25rem; }
  .node:nth-child(even) { background: var(--surface-head); }
  .node:hover { background: var(--hover-background); }
  .node.on { background: var(--pressed-background); color: var(--pressed-color); }
  .depth-1 { padding-left: calc(.25rem + var(--indent)); }
  .depth-2 { padding-left: calc(.25rem + 2 * var(--indent)); }
  .depth-3 { padding-left: calc(.25rem + 3 * var(--indent)); }
  .guide { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--line); pointer-events: none; }
  .g1 { left: calc(.25rem + var(--cell) / 2); }
  .g2 { left: calc(.25rem + var(--indent) + var(--cell) / 2); }
  .g3 { left: calc(.25rem + 2 * var(--indent) + var(--cell) / 2); }
  .chevron, .type, .eye { flex: none; width: var(--cell); height: var(--cell); display: inline-flex; align-items: center; justify-content: center; }
  .chevron, .type { color: var(--muted); }
  button.chevron, button.eye { padding: 0; border: none; background: none; color: var(--muted); cursor: pointer; border-radius: var(--control-radius); }
  button.chevron:hover, button.eye:hover { color: var(--text); }
  button.eye[aria-pressed="true"] { color: var(--text); }
  .on .chevron, .on .type, .on button.eye { color: var(--pressed-color); }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: .375rem; height: var(--cell); padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer; }
  .pick:disabled { cursor: default; }
  .pick.muted { color: var(--muted); }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { font-size: .6em; }
</style>
