<script lang="ts">
  import { onMount } from "svelte";
  import { getEntityRef } from "@engine/content/game-config";
  import type { EntityData, Entry, Target } from "@engine/types";
  import { content } from "$lib/content.svelte";
  import { Stage } from "$lib/stage/stage.svelte";
  import { getPreview, setTargetHidden, subscribePreview, type PreviewState } from "$lib/stage/preview";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";

  /**
   * The spread as a tree in the style of Blender's outliner: a chevron column, a type icon before every name, guide
   * lines per depth, zebra rows, the eye in a column at the right (shown = found, off = reported lost – the Stage
   * panel's chips do the same), the selected row highlighted over its whole width. Rows: the spread, its entries in
   * page order, each entry's target, and the target's entity as its **node tree** (content schema 2.0: the root node
   * and its children, as deep as the content nests them). A tap on a node selects it for the Entity panel (a tap on
   * the stage selects the root); ↑ ↓ walk the targets, ← → fold and unfold the entry, Enter selects. Folding is per
   * entry and per node and not stored. ● after a name: the stage shows it with other values than the draft's.
   */
  let { stage, spreadId, selected = $bindable(), node = $bindable([]), onselect, onaddtarget, onremovetarget }: {
    stage: Stage | null; spreadId: string; selected: string | null;
    /** The selected node's path in its entity (`[]` = the root) */
    node: number[];
    onselect?: (targetId: string) => void;
    /** "+ target": the workspace opens the form */
    onaddtarget?: () => void;
    /** The menu's "Remove target": entry and target go (the workspace asks the API) */
    onremovetarget?: (target: Target) => Promise<void>;
  } = $props();

  const spread = $derived(content.spread(spreadId));
  /** "28–29"; a spread title that only repeats it (the import's default) is not shown twice */
  const pages = $derived(spread ? `${spread.firstPage}${spread.lastPage !== spread.firstPage ? `–${spread.lastPage}` : ""}` : "");
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  let folded = $state<Record<string, boolean>>({});
  const fold = (key: string, to?: boolean) => (folded = { ...folded, [key]: to ?? !folded[key] });

  /** The targets that can be selected (with an image), in tree order */
  const selectable = $derived((spread?.entries ?? []).map(entry => entry.target).filter((t): t is Target => !!t?.imageSrc));

  const pick = (target: Target, path: number[] = []) => {
    selected = target.id;
    node = path;
    onselect?.(target.id);
  };
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  const NODE_ICONS: Record<string, IconName> = { group: "layers", model: "model", video: "video", image: "image", text: "type" };
  const nodeIcon = (n: EntityData): IconName => NODE_ICONS[n.type] ?? "layers";
  const nodeName = (n: EntityData, target: Target, path: number[]) => {
    const ref = path.length ? undefined : getEntityRef(target.id);
    if (n.type === "text") return `“${(n.text ?? "").slice(0, 40)}”`;
    return `${n.type}${n.id ? ` ${n.id}` : ""}${ref ? ` · ${ref}` : ""}`;
  };
  /** The entity shown for a target: the stage's override (a live edit, or removed) or the draft's */
  const treeOf = (target: Target): EntityData | undefined => {
    const override = stage?.overrideOf(target.id);
    if (override === Stage.REMOVED) return undefined;
    return override ?? target.entity;
  };

  // ── the context menu of a node row (right click, or the ⋯ of a long press): remove ──
  let menu = $state<{ x: number; y: number; target: Target; path: number[]; kind: "node" | "target" } | null>(null);
  const openMenu = (event: MouseEvent, target: Target, path: number[], kind: "node" | "target" = "node") => {
    event.preventDefault();
    pick(target, path);
    menu = { x: Math.min(event.clientX, window.innerWidth - 200), y: Math.min(event.clientY, window.innerHeight - 80), target, path, kind };
  };
  const closeMenu = () => (menu = null);
  /** Remove the selected node (the tree's menu, Delete / Backspace): the parent is selected next */
  const removeSelected = () => {
    const target = selected ? selectable.find(t => t.id === selected) : undefined;
    if (!target || !stage || !treeOf(target)) return;
    node = stage.removeNode(target.id, node);
    menu = null;
  };
  const entryOf = (targetId: string): Entry | undefined => spread?.entries.find(entry => entry.target?.id === targetId);

  const onKey = (event: KeyboardEvent) => {
    const index = selectable.findIndex(t => t.id === selected);
    const entry = selected ? entryOf(selected) : undefined;
    switch (event.key) {
      case "ArrowDown": { const t = selectable[Math.min(selectable.length - 1, index + 1)] ?? selectable[0]; if (t) pick(t); break; }
      case "ArrowUp": { const t = selectable[Math.max(0, index - 1)] ?? selectable[0]; if (t) pick(t); break; }
      case "ArrowLeft": if (entry) fold(entry.id, true); break;
      case "ArrowRight": if (entry) fold(entry.id, false); break;
      case "Enter": case " ": if (index >= 0) onselect?.(selected!); break;
      case "Delete": case "Backspace": removeSelected(); break;
      case "Escape": if (menu) menu = null; else return; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
</script>

{#snippet guides(depth: number)}
  {#each { length: depth } as _, i (i)}<span class="guide" style:left="calc(.25rem + {i} * var(--indent) + var(--cell) / 2)"></span>{/each}
{/snippet}

{#snippet nodeRows(target: Target, n: EntityData, path: number[], depth: number, shown: boolean)}
  {@const key = `${target.id}:${path.join(".")}`}
  {@const open = !folded[key]}
  {@const children = n.children ?? []}
  {@const on = selected === target.id && same(node, path)}
  <div class="node" class:on role="treeitem" aria-expanded={children.length ? open : undefined} aria-selected={on} style:padding-left="calc(.25rem + {depth} * var(--indent))">
    {@render guides(depth)}
    {#if children.length}
      <button type="button" class="chevron" onclick={() => fold(key)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
    {:else}
      <span class="chevron"></span>
    {/if}
    <span class="type"><Icon name={nodeIcon(n)} size="1em" stroke={2} /></span>
    <button type="button" class="pick" class:muted={!shown} onclick={() => pick(target, path)} oncontextmenu={e => openMenu(e, target, path)} title={path.length ? "Edit this node" : "Edit the entity's root node"}>
      <span class="name">{nodeName(n, target, path)}</span>
      {#if !path.length && stage?.overrideOf(target.id)}<span class="dot" title="Shown with other values than the draft's">●</span>{/if}
    </button>
    <span class="eye"></span>
  </div>
  {#if open}
    {#each children as child, i (i)}
      {@render nodeRows(target, child, [...path, i], depth + 1, shown)}
    {/each}
  {/if}
{/snippet}

{#if !spread}
  <p class="muted small">No spread.</p>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="tree" role="tree" aria-label="Spread tree" tabindex="0" onkeydown={onKey}>
    <div class="node" role="treeitem" aria-expanded="true" aria-selected="false">
      <span class="chevron"><Icon name="down" size="1em" /></span>
      <span class="type"><Icon name="book" size="1em" stroke={2} /></span>
      <span class="name">{spread.title}</span>
      {#if spread.title.replace(/[-–—]/g, "–") !== pages}<span class="small muted">{pages}</span>{/if}
      <span class="eye"></span>
    </div>
    {#each spread.entries as entry (entry.id)}
      {@const target = entry.target}
      {@const open = !folded[entry.id]}
      {@const shown = !!target && !preview.hidden.includes(target.id)}
      {@const tree = target ? treeOf(target) : undefined}
      <div class="node depth-1" role="treeitem" aria-expanded={target ? open : undefined} aria-selected="false">
        {@render guides(1)}
        {#if target}
          <button type="button" class="chevron" onclick={() => fold(entry.id)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
        {:else}
          <span class="chevron"></span>
        {/if}
        <span class="type"><Icon name="entry" size="1em" stroke={2} /></span>
        <button type="button" class="pick" class:muted={!!target && !shown} disabled={!target} onclick={() => target && pick(target)} title="{entry.category} · p.{entry.page}{target ? '' : ' – no target'}">
          <span class="name">{entry.title}</span>
        </button>
        {#if target}
          <button type="button" class="eye" aria-pressed={shown} title={shown ? "Found – tap to lose" : "Lost – tap to find"} aria-label="Found" onclick={() => setTargetHidden(target.id, shown)}><Icon name={shown ? "eye" : "eye-off"} size="1em" stroke={2} /></button>
        {:else}
          <span class="eye"></span>
        {/if}
      </div>
      {#if target && open}
        {@const on = selected === target.id && !tree}
        <div class="node depth-2" class:on role="treeitem" aria-selected={on}>
          {@render guides(2)}
          <span class="chevron"></span>
          <span class="type"><Icon name="target" size="1em" stroke={2} /></span>
          <button type="button" class="pick" class:muted={!shown} onclick={() => pick(target)} oncontextmenu={e => openMenu(e, target, [], "target")} title={tree ? "Select the target (its root node)" : "No AR content yet – add a node in the Entity panel"}>
            <span class="name">{target.id}</span>
            {#if stage?.found.includes(target.id)}<span class="small muted" title="In view now">in view</span>{/if}
          </button>
          <span class="eye"></span>
        </div>
        {#if tree}
          {@render nodeRows(target, tree, [], 3, shown)}
        {/if}
      {/if}
    {/each}
    {#if onaddtarget}
      <div class="node add-target">
        <span class="chevron"></span>
        <span class="type"><Icon name="plus" size="1em" /></span>
        <button type="button" class="pick" onclick={onaddtarget} title="A new entry with a printed image on this spread"><span class="name">+ target</span></button>
      </div>
    {/if}
  </div>
{/if}

{#if menu}
  <button type="button" class="menu-backdrop" aria-label="Close the menu" onclick={closeMenu} oncontextmenu={e => { e.preventDefault(); closeMenu(); }}></button>
  <div class="menu" role="menu" style:left="{menu.x}px" style:top="{menu.y}px">
    {#if menu.kind === "target"}
      <button type="button" role="menuitem" class="menu-item" onclick={() => { const t = menu!.target; menu = null; void onremovetarget?.(t); }}>Remove target</button>
      <span class="menu-hint small muted">entry and target</span>
    {:else}
      <button type="button" role="menuitem" class="menu-item" onclick={removeSelected}>{menu.path.length ? "Remove node" : "Remove entity"}</button>
      <span class="menu-hint small muted">Delete</span>
    {/if}
  </div>
{/if}

<style>
  .tree { display: flex; flex-direction: column; --indent: 1.125rem; --cell: 1.125rem; outline: none; }
  .menu-backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .menu { position: fixed; z-index: 10; display: flex; align-items: center; gap: .5rem; padding: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .menu-item { height: var(--control-height); padding: 0 .625rem; border: none; border-radius: var(--control-radius); background: none; color: var(--danger); cursor: pointer; white-space: nowrap; }
  .menu-item:hover { background: var(--hover-background); }
  .menu-hint { padding-right: .375rem; }
  .tree:focus-visible .node.on { box-shadow: inset 0 0 0 1px var(--text); }
  .node { position: relative; display: flex; align-items: center; gap: .25rem; height: 1.5rem; padding: 0 .25rem; }
  .node:nth-child(even) { background: var(--surface-head); }
  .node:hover { background: var(--hover-background); }
  .node.on { background: var(--pressed-background); color: var(--pressed-color); }
  .depth-1 { padding-left: calc(.25rem + var(--indent)); }
  .depth-2 { padding-left: calc(.25rem + 2 * var(--indent)); }
  .guide { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--line); pointer-events: none; }
  .chevron, .type, .eye { flex: none; width: var(--cell); height: var(--cell); display: inline-flex; align-items: center; justify-content: center; }
  .chevron, .type { color: var(--muted); }
  button.chevron, button.eye { padding: 0; border: none; background: none; color: var(--muted); cursor: pointer; border-radius: var(--control-radius); }
  button.chevron:hover, button.eye:hover { color: var(--text); }
  button.eye[aria-pressed="true"] { color: var(--text); }
  .on .chevron, .on .type { color: var(--pressed-color); }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: .375rem; height: var(--cell); padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer; }
  .pick:disabled { cursor: default; }
  .pick.muted { color: var(--muted); }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { font-size: .6em; }
  .add-target { padding-left: calc(.25rem + var(--indent)); color: var(--muted); }
  .add-target:hover { color: var(--text); }
</style>
