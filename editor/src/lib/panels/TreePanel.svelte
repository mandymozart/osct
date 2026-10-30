<script lang="ts">
  import { onMount } from "svelte";
  import { getEntityRef } from "@engine/content/game-config";
  import { nodeTypeSpec, type EntityData, type Entry, type Target } from "@engine/types";
  import { content } from "$lib/content.svelte";
  import { Stage } from "$lib/stage/stage.svelte";
  import { getPreview, setTargetHidden, subscribePreview, type PreviewState } from "$lib/stage/preview";
  import { selection } from "$lib/selection.svelte";
  import { indentNode, isWithin, moveNode, nodeLabel, outdentNode, samePath, shiftNode, visiblePaths, type DropZone, type TreeEdit } from "$lib/tree";
  import { nodeAt } from "$lib/values";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";

  /**
   * The spread as a tree in the style of Blender's outliner: a chevron column, a type icon before every name, guide
   * lines per depth, zebra rows, the eye in a column at the right (shown = found, off = reported lost – the Stage
   * panel's chips do the same). Rows: the spread, its entries in page order, each entry's target, and the target's
   * entity as its **node tree** (content schema 2.0: the root node and its children, as deep as the content nests
   * them), each node by its name (schema 2.12) or its type. It reads and writes the workspace's one selection
   * (`selection.svelte.ts`, #162): a tap on a target row selects the target, a tap on a node row the node; the
   * selected row is highlighted over its whole width, the hovered one lighter, the rows above a selected node marked.
   * Hierarchy (#163): a node row is dragged onto another row (its child) or between two rows (its sibling, the
   * order set) – with a finger by its type icon; the keys: ↑ ↓ walk the rows, ← → fold / unfold (← on an open row
   * steps up a level), Alt + ↑ ↓ move the node among its siblings, Tab / Shift + Tab indent / outdent, Enter opens the
   * Entity panel, Delete removes the node. Changes are live on the stage (`stage.editTree`); Save in the Entity panel
   * writes them. Folding is per entry and per node and not stored. ● after a name: the stage shows it with other
   * values than the draft's.
   */
  let { stage, spreadId, onselect, onaddtarget, onremovetarget }: {
    stage: Stage | null; spreadId: string;
    /** A row was chosen (a tap, Enter): the workspace shows the Entity panel */
    onselect?: (targetId: string) => void;
    /** "+ target": the workspace opens the form */
    onaddtarget?: () => void;
    /** The menu's "Remove target": entry and target go (the workspace asks the API) */
    onremovetarget?: (target: Target) => Promise<void>;
  } = $props();

  const spread = $derived(content.spread(spreadId));
  /** "28–29"; a spread title that only repeats it (the import's default) is not shown twice */
  const pages = $derived(spread ? (spread.format === "cover" ? "cover" : spread.format === "back" ? "back" : `${spread.firstPage}${spread.lastPage !== spread.firstPage ? `–${spread.lastPage}` : ""}`) : "");
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  let folded = $state<Record<string, boolean>>({});
  const fold = (key: string, to?: boolean) => (folded = { ...folded, [key]: to ?? !folded[key] });
  const nodeKey = (target: Target, path: number[]) => `${target.id}:${path.join(".")}`;

  /** The targets that can be selected (with an image), in tree order */
  const selectable = $derived((spread?.entries ?? []).map(entry => entry.target).filter((t): t is Target => !!t?.imageSrc));

  /** The entity shown for a target: the stage's override (a live edit, or removed) or the draft's */
  const treeOf = (target: Target): EntityData | undefined => {
    const override = stage?.overrideOf(target.id);
    if (override === Stage.REMOVED) return undefined;
    return override ?? target.entity;
  };

  const pickTarget = (target: Target) => {
    selection.selectTarget(target.id);
    onselect?.(target.id);
  };
  const pickNode = (target: Target, path: number[]) => {
    selection.selectNode(target.id, path);
    onselect?.(target.id);
  };
  const isTargetOn = (target: Target) => selection.target === target.id && (selection.onTarget || !treeOf(target));
  const isNodeOn = (target: Target, path: number[]) => selection.target === target.id && !selection.onTarget && samePath(selection.node, path);
  /** A row above the selected node (its target, its parents): marked lighter, so the level is clear */
  const isWithinOn = (target: Target, path: number[] | null) =>
    selection.target === target.id && !selection.onTarget && (path === null || (path.length < selection.node.length && isWithin(selection.node, path)));

  const NODE_ICONS: Record<string, IconName> = { group: "layers", model: "model", video: "video", image: "image", text: "type", light: "light" };
  /** A plugin's node type (#77): the code icon – its look is the plugin's; a type nobody registered: a plain group */
  const nodeIcon = (n: EntityData): IconName => NODE_ICONS[n.type] ?? (nodeTypeSpec(n.type) ? "code" : "layers");
  const rowName = (n: EntityData, target: Target, path: number[]) => {
    const ref = path.length ? undefined : getEntityRef(target.id);
    return `${nodeLabel(n)}${ref ? ` · ${ref}` : ""}`;
  };

  // ── changing the hierarchy: live on the stage, the moved node selected ──
  const edit = (target: Target, change: (tree: EntityData) => TreeEdit | null): boolean => {
    const placed: { path: number[] | null } = { path: null };
    const done = stage?.editTree(target.id, tree => {
      const result = change(tree);
      placed.path = result?.path ?? null;
      return result?.tree ?? null;
    });
    const path = placed.path;
    if (!done || !path) return false;
    // The rows above the moved node unfold, so it stays in view
    const opened = { ...folded };
    for (let depth = 0; depth < path.length; depth++) delete opened[nodeKey(target, path.slice(0, depth))];
    folded = opened;
    selection.selectNode(target.id, path);
    return true;
  };
  /** The selected node and its target, while a node (not the target) is selected */
  const selectedNode = (): { target: Target; path: number[] } | null => {
    const target = selection.target ? selectable.find(t => t.id === selection.target) : undefined;
    return target && !selection.onTarget && treeOf(target) ? { target, path: selection.node } : null;
  };
  const shift = (direction: -1 | 1) => { const s = selectedNode(); return !!s && edit(s.target, tree => shiftNode(tree, s.path, direction)); };
  const indent = () => { const s = selectedNode(); return !!s && edit(s.target, tree => indentNode(tree, s.path)); };
  const outdent = () => { const s = selectedNode(); return !!s && edit(s.target, tree => outdentNode(tree, s.path)); };

  // ── the context menu of a row (right click): remove, and the hierarchy's moves ──
  let menu = $state<{ x: number; y: number; target: Target; path: number[]; kind: "node" | "target" } | null>(null);
  const openMenu = (event: MouseEvent, target: Target, path: number[], kind: "node" | "target" = "node") => {
    event.preventDefault();
    if (kind === "target") selection.selectTarget(target.id);
    else selection.selectNode(target.id, path);
    menu = { x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 200), target, path, kind };
  };
  const closeMenu = () => (menu = null);
  const menuDo = (action: () => unknown) => { action(); menu = null; };
  /** Remove the selected node (the tree's menu, Delete / Backspace): the parent is selected next, the target after the root */
  const removeSelected = () => {
    const s = selectedNode();
    menu = null;
    if (!s || !stage) return;
    const next = stage.removeNode(s.target.id, s.path);
    if (s.path.length) selection.selectNode(s.target.id, next);
    else selection.selectTarget(s.target.id);
  };
  const entryOf = (targetId: string): Entry | undefined => spread?.entries.find(entry => entry.target?.id === targetId);

  // ── the keys: the rows as they are shown, in order ──
  type Row = { target: Target; path: number[] | null };
  const rows = $derived.by<Row[]>(() =>
    selectable.flatMap(target => {
      const entry = entryOf(target.id);
      const tree = treeOf(target);
      const open = !entry || !folded[entry.id];
      const nodes = tree && open ? visiblePaths(tree, path => !folded[nodeKey(target, path)]).map(path => ({ target, path })) : [];
      return [{ target, path: null } as Row, ...nodes];
    }),
  );
  const currentRow = () => rows.findIndex(row => (row.path === null ? isTargetOn(row.target) : isNodeOn(row.target, row.path)));
  const selectRow = (row: Row | undefined) => {
    if (!row) return;
    if (row.path === null) selection.selectTarget(row.target.id);
    else selection.selectNode(row.target.id, row.path);
  };

  const onKey = (event: KeyboardEvent) => {
    const index = currentRow();
    const row = rows[index];
    const tree = row ? treeOf(row.target) : undefined;
    const node = row?.path && tree ? nodeAt(tree, row.path) : undefined;
    const key = row?.path ? nodeKey(row.target, row.path) : row ? entryOf(row.target.id)?.id : undefined;
    const open = !!key && !folded[key];
    const hasChildren = row?.path ? !!node?.children?.length : !!tree;
    switch (event.key) {
      case "ArrowDown":
        if (event.altKey) { if (!shift(1)) return; break; }
        selectRow(rows[index < 0 ? 0 : Math.min(rows.length - 1, index + 1)]);
        break;
      case "ArrowUp":
        if (event.altKey) { if (!shift(-1)) return; break; }
        selectRow(rows[index < 0 ? 0 : Math.max(0, index - 1)]);
        break;
      case "ArrowLeft":
        if (event.altKey) return;
        if (key && hasChildren && open) fold(key, true);
        else if (row?.path) selection.up();
        break;
      case "ArrowRight":
        if (event.altKey) return;
        if (key && hasChildren && !open) fold(key, false);
        else if (hasChildren) selectRow(rows[index + 1]);
        break;
      case "Tab":
        // Only while it moves a node: else Tab leaves the tree as everywhere
        if (!(event.shiftKey ? outdent() : indent())) return;
        break;
      case "Enter": case " ": if (row) onselect?.(row.target.id); break;
      case "Delete": case "Backspace": removeSelected(); break;
      case "Escape": if (menu) menu = null; else return; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  // ── drag and drop: a node row onto another row (inside) or between two (before / after) – within its target's
  // tree. A mouse drags the whole row, a finger its type icon (the row itself scrolls the tree). ──
  const DRAG_PX = 5;
  let drag = $state<{ target: Target; from: number[]; pointerId: number; startY: number; active: boolean } | null>(null);
  let drop = $state<{ key: string; zone: DropZone } | null>(null);
  /** The click that ends a drag selects nothing */
  let swallowClick = false;
  const rowOf = (element: Element | null) => {
    const row = element?.closest<HTMLElement>("[data-path]");
    if (!row) return null;
    const path = row.dataset.path ? row.dataset.path.split(".").map(Number) : [];
    return { row, targetId: row.dataset.target ?? "", path };
  };
  const zoneAt = (row: HTMLElement, clientY: number): DropZone => {
    const rect = row.getBoundingClientRect();
    const share = (clientY - rect.top) / Math.max(1, rect.height);
    return share < 0.3 ? "before" : share > 0.7 ? "after" : "inside";
  };
  const dragDown = (event: PointerEvent) => {
    swallowClick = false;
    if (event.button !== 0) return;
    const hit = rowOf(event.target as Element);
    if (!hit || !hit.path.length) return; // the root stays the root
    if (event.pointerType !== "mouse" && !(event.target as Element).closest(".handle")) return;
    const target = selectable.find(t => t.id === hit.targetId);
    if (target) drag = { target, from: hit.path, pointerId: event.pointerId, startY: event.clientY, active: false };
  };
  const dragMove = (event: PointerEvent) => {
    const d = drag;
    if (!d || event.pointerId !== d.pointerId) return;
    if (!d.active) {
      if (Math.abs(event.clientY - d.startY) < DRAG_PX) return;
      d.active = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    const hit = rowOf(document.elementFromPoint(event.clientX, event.clientY));
    const tree = treeOf(d.target);
    if (!hit || hit.targetId !== d.target.id || !tree) { drop = null; return; }
    const zone = zoneAt(hit.row, event.clientY);
    drop = moveNode(tree, d.from, hit.path, zone) ? { key: nodeKey(d.target, hit.path), zone } : null;
  };
  const dragUp = (event: PointerEvent) => {
    const d = drag;
    if (!d || event.pointerId !== d.pointerId) return;
    if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
    drag = null;
    const landed = drop;
    drop = null;
    if (!d.active) return;
    swallowClick = true;
    if (!landed || event.type !== "pointerup") return;
    const onto = landed.key.slice(d.target.id.length + 1);
    edit(d.target, tree => moveNode(tree, d.from, onto ? onto.split(".").map(Number) : [], landed.zone));
  };
  const dragClick = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  };
</script>

{#snippet guides(depth: number)}
  {#each { length: depth } as _, i (i)}<span class="guide" style:left="calc(.25rem + {i} * var(--indent) + var(--cell) / 2)"></span>{/each}
{/snippet}

{#snippet nodeRows(target: Target, n: EntityData, path: number[], depth: number, shown: boolean)}
  {@const key = nodeKey(target, path)}
  {@const open = !folded[key]}
  {@const children = n.children ?? []}
  {@const on = isNodeOn(target, path)}
  {@const dropZone = drop?.key === key ? drop.zone : null}
  <div class="node" class:on class:within={isWithinOn(target, path)} class:dragged={!!drag?.active && drag.target.id === target.id && isWithin(path, drag.from)}
    class:drop-before={dropZone === "before"} class:drop-inside={dropZone === "inside"} class:drop-after={dropZone === "after"}
    role="treeitem" aria-expanded={children.length ? open : undefined} aria-selected={on} aria-level={depth + 1}
    data-target={target.id} data-path={path.join(".")} style:padding-left="calc(.25rem + {depth} * var(--indent))">
    {@render guides(depth)}
    {#if children.length}
      <button type="button" class="chevron" onclick={() => fold(key)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
    {:else}
      <span class="chevron"></span>
    {/if}
    <span class="type" class:handle={path.length > 0} title={path.length ? "Drag to move the node: onto a row = its child, between rows = its sibling" : undefined}><Icon name={nodeIcon(n)} size="1em" stroke={2} /></span>
    <button type="button" class="pick" class:muted={!shown} onclick={() => pickNode(target, path)} oncontextmenu={e => openMenu(e, target, path)} title={path.length ? `${n.type} – select this node` : `${n.type} – select the entity (its root node)`}>
      <span class="name">{rowName(n, target, path)}</span>
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
  <!-- The tree takes the keys and the drags of its rows (a focusable tree is a control) -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="tree" class:dragging={!!drag?.active} role="tree" aria-label="Spread tree" tabindex="0" onkeydown={onKey}
    onpointerdown={dragDown} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} onlostpointercapture={dragUp} onclickcapture={dragClick}
    data-help-name="Tree" data-help="A tap selects a target, its entity or a node; the Entity panel and the stage follow. Drag a node onto a row to make it that node's child, between two rows to make it a sibling there (with a finger, drag its icon). Keys: ↑ ↓ walk, ← → fold, Alt + ↑ ↓ move, Tab / Shift + Tab indent / outdent, Delete removes.">
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
      <div class="node depth-1" class:within={!!target && (isTargetOn(target) || isWithinOn(target, null))} role="treeitem" aria-expanded={target ? open : undefined} aria-selected="false">
        {@render guides(1)}
        {#if target}
          <button type="button" class="chevron" onclick={() => fold(entry.id)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
        {:else}
          <span class="chevron"></span>
        {/if}
        <span class="type"><Icon name="entry" size="1em" stroke={2} /></span>
        <button type="button" class="pick" class:muted={!!target && !shown} disabled={!target?.imageSrc} onclick={() => target && pickTarget(target)} title="{entry.category} · p.{entry.page}{target ? ' – select its target' : ' – no target'}">
          <span class="name">{entry.title}</span>
        </button>
        {#if target}
          <button type="button" class="eye" aria-pressed={shown} title={shown ? "Found – tap to lose" : "Lost – tap to find"} aria-label="Found" onclick={() => setTargetHidden(target.id, shown)}><Icon name={shown ? "eye" : "eye-off"} size="1em" stroke={2} /></button>
        {:else}
          <span class="eye"></span>
        {/if}
      </div>
      {#if target && open}
        {@const on = isTargetOn(target)}
        <div class="node depth-2" class:on class:within={isWithinOn(target, null)} role="treeitem" aria-selected={on} aria-level={3}>
          {@render guides(2)}
          <span class="chevron"></span>
          <span class="type"><Icon name="target" size="1em" stroke={2} /></span>
          <button type="button" class="pick" class:muted={!shown} onclick={() => pickTarget(target)} oncontextmenu={e => openMenu(e, target, [], "target")} title={tree ? "Select the target: its printed image and placement" : "Select the target – no AR content yet, add a node in the Entity panel"}>
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
  {@const m = menu}
  {@const tree = treeOf(m.target)}
  {@const siblings = m.path.length && tree ? (nodeAt(tree, m.path.slice(0, -1))?.children?.length ?? 0) : 0}
  {@const last = m.path[m.path.length - 1] ?? 0}
  <button type="button" class="menu-backdrop" aria-label="Close the menu" onclick={closeMenu} oncontextmenu={e => { e.preventDefault(); closeMenu(); }}></button>
  <div class="menu" role="menu" data-app-ui style:left="{m.x}px" style:top="{m.y}px">
    {#if m.kind === "target"}
      <button type="button" role="menuitem" class="menu-item danger" onclick={() => { menu = null; void onremovetarget?.(m.target); }}>Remove target <span class="menu-hint small muted">entry and target</span></button>
    {:else}
      {#if m.path.length}
        <button type="button" role="menuitem" class="menu-item" disabled={last === 0} onclick={() => menuDo(() => shift(-1))}>Move up <span class="menu-hint small muted">Alt ↑</span></button>
        <button type="button" role="menuitem" class="menu-item" disabled={last >= siblings - 1} onclick={() => menuDo(() => shift(1))}>Move down <span class="menu-hint small muted">Alt ↓</span></button>
        <button type="button" role="menuitem" class="menu-item" disabled={last === 0} onclick={() => menuDo(indent)}>Into the node above <span class="menu-hint small muted">Tab</span></button>
        <button type="button" role="menuitem" class="menu-item" onclick={() => menuDo(outdent)}>Out of its parent <span class="menu-hint small muted">Shift Tab</span></button>
      {/if}
      <button type="button" role="menuitem" class="menu-item danger" onclick={removeSelected}>{m.path.length ? "Remove node" : "Remove entity"} <span class="menu-hint small muted">Delete</span></button>
    {/if}
  </div>
{/if}

<style>
  .tree { display: flex; flex-direction: column; --indent: 1.125rem; --cell: 1.125rem; outline: none; }
  .tree.dragging { cursor: grabbing; user-select: none; }
  .menu-backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .menu { position: fixed; z-index: 10; display: flex; flex-direction: column; min-width: 12rem; padding: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .menu-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; height: var(--control-height); padding: 0 .625rem; border: none; border-radius: var(--control-radius); background: none; color: inherit; text-align: left; cursor: pointer; white-space: nowrap; }
  .menu-item:hover:not(:disabled) { background: var(--hover-background); }
  .menu-item:disabled { opacity: .45; cursor: not-allowed; }
  .menu-item.danger { color: var(--danger); }
  .node { position: relative; display: flex; align-items: center; gap: .25rem; height: 1.5rem; padding: 0 .25rem; }
  .node:nth-child(even) { background: var(--surface-head); }
  /* The rows above the selected node (its target, its parents): the level stays readable */
  .node.within { background: var(--within-background); }
  .node:hover { background: var(--hover-background); }
  /* The selected row: its own background over the whole width and a bar at its start (no colour – RULES #32) */
  .node.on { background: var(--selected-background); color: var(--pressed-color); box-shadow: inset 2px 0 0 var(--text); }
  .tree:focus-visible .node.on { box-shadow: inset 2px 0 0 var(--text), inset 0 0 0 1px var(--text); }
  .node.dragged { opacity: .45; }
  /* Where a dragged row lands: a line between two rows, or a frame around the row that takes it as a child */
  .node.drop-before { box-shadow: inset 0 2px 0 var(--text); }
  .node.drop-after { box-shadow: inset 0 -2px 0 var(--text); }
  .node.drop-inside { box-shadow: inset 0 0 0 2px var(--text); }
  .depth-1 { padding-left: calc(.25rem + var(--indent)); }
  .depth-2 { padding-left: calc(.25rem + 2 * var(--indent)); }
  .guide { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--line); pointer-events: none; }
  .chevron, .type, .eye { flex: none; width: var(--cell); height: var(--cell); display: inline-flex; align-items: center; justify-content: center; }
  .chevron, .type { color: var(--muted); }
  /* A movable node's icon is its handle: a finger drags it there without scrolling the tree */
  .type.handle { cursor: grab; touch-action: none; }
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
  @media (pointer: coarse) {
    /* A finger: rows of the touch control height (#171); the chevron and the eye take the row's full height, the eye
       as wide as high, the chevron a wider cell (the guides follow --cell) */
    .tree { --cell: 1.75rem; }
    .node { height: var(--control-height); }
    .pick { height: 100%; }
    button.chevron, button.eye { height: 100%; }
    .eye { width: var(--control-height); margin-right: -.25rem; }
  }
</style>
