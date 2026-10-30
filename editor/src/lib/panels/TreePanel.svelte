<script lang="ts">
  import { onMount } from "svelte";
  import { getEntityRef } from "@engine/content/game-config";
  import { nodeTypeSpec, type EntityData, type Entry, type Target } from "@engine/types";
  import { content } from "#lib/content.svelte.js";
  import { Stage } from "#lib/stage/stage.svelte.js";
  import { getPreview, setTargetHidden, subscribePreview, type PreviewState } from "#lib/stage/preview.js";
  import { selection } from "#lib/selection.svelte.js";
  import { indentNode, isWithin, moveNode, nodeLabel, outdentNode, shiftNode, visiblePaths, type DropZone, type TreeEdit } from "#lib/tree.js";
  import { isRowOn, parentRow, rowSelection, stepRow, treeRows, type TreeRow } from "#lib/tree-rows.js";
  import { entryRowHelp } from "#lib/entry-view.js";
  import { spreadPages } from "#lib/spread-view.js";
  import { nodeAt } from "#lib/values.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import { menuTrigger } from "#lib/menu-trigger.js";
  import { isMenuKey, type Point } from "#lib/context-menu.js";

  /**
   * The spread as a tree in the style of Blender's outliner: a chevron column, a type icon before every name, guide
   * lines per depth, zebra rows, the eye in a column at the right (shown = found, off = reported lost – the Stage
   * panel's chips do the same). Rows: the spread, its entries in page order, each entry's target, and the target's
   * entity as its **node tree** (content schema 2.0: the root node and its children, as deep as the content nests
   * them), each node by its name (schema 2.12) or its type. It reads and writes the workspace's one selection
   * (`selection.svelte.ts`, #162; the rows' rules in `tree-rows.ts`): every row is selectable (#227) – a tap on the
   * spread row selects the spread (the workspace opens the Stage panel's spread section), on an entry row the entry (the
   * Entity panel shows it, the stage outlines its target), on a target row the target, on a node row the node; the
   * selected row is highlighted over its whole width, the hovered one lighter, the rows above a selected node marked.
   * Hierarchy (#163): a node row is dragged onto another row (its child) or between two rows (its sibling, the
   * order set) – with a finger by its type icon; the keys: ↑ ↓ walk all rows, ← → fold / unfold (← elsewhere steps up
   * a level), Alt + ↑ ↓ move the node among its siblings, Tab / Shift + Tab indent / outdent, Enter opens the row's
   * panel, Delete removes the node – on an entry row it asks first (#198's confirmation). An entry, target or node
   * row's menu (`ContextMenu`: a right click, a long press, or the menu key for the selected row) has the same moves
   * and the removal. Changes are live on the stage
   * (`stage.editTree`); Save in the Entity panel writes them. Folding is per entry and per node and not stored. ● after a name: the stage shows it with other
   * values than the draft's.
   */
  let { stage, spreadId, onselect, onaddtarget, onremoveentry }: {
    stage: Stage | null; spreadId: string;
    /** A row was chosen (a tap, Enter): the workspace shows its panel – the spread's section, else the Entity panel */
    onselect?: (kind: TreeRow["kind"]) => void;
    /** "+ target": the workspace opens the form */
    onaddtarget?: () => void;
    /** "Remove target" / "Remove entry", Delete on an entry row: the entry with everything on it, after the confirmation the workspace shows (#198) */
    onremoveentry?: (entryId: string, targetId: string | null) => Promise<void>;
  } = $props();

  const spread = $derived(content.spread(spreadId));
  /** "28–29"; a spread title that only repeats it (the import's default) is not shown twice */
  const pages = $derived(spread ? spreadPages(spread) : "");
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  let folded = $state<Record<string, boolean>>({});
  const fold = (key: string, to?: boolean) => (folded = { ...folded, [key]: to ?? !folded[key] });
  const nodeKey = (target: Target | string, path: number[]) => `${typeof target === "string" ? target : target.id}:${path.join(".")}`;

  /** The targets that can be selected (with an image), in tree order */
  const selectable = $derived((spread?.entries ?? []).map(entry => entry.target).filter((t): t is Target => !!t?.imageSrc));

  /** The entity shown for a target: the stage's override (a live edit, or removed) or the draft's */
  const treeOf = (target: Target): EntityData | undefined => {
    const override = stage?.overrideOf(target.id);
    if (override === Stage.REMOVED) return undefined;
    return override ?? target.entity;
  };

  /** A tap (or Enter) on a row: it is selected, the workspace shows its panel */
  const pick = (row: TreeRow) => {
    selection.set(rowSelection(row));
    onselect?.(row.kind);
  };
  const entryRow = (entry: Entry): TreeRow => ({ kind: "entry", entryId: entry.id, targetId: entry.target?.id ?? null });
  const hasTree = (targetId: string) => {
    const target = selectable.find(t => t.id === targetId);
    return !!target && !!treeOf(target);
  };
  const isOn = (row: TreeRow) => isRowOn(row, selection, hasTree);
  const spreadOn = $derived(isOn({ kind: "spread" }));
  const isTargetOn = (target: Target) => isOn({ kind: "target", targetId: target.id });
  const isNodeOn = (target: Target, path: number[]) => isOn({ kind: "node", targetId: target.id, path });
  /** A row above the selected node (its target, its parents): marked lighter, so the level is clear */
  const isWithinOn = (target: Target, path: number[] | null) =>
    !selection.spread && !selection.entry && selection.target === target.id && !selection.onTarget
    && (path === null || (path.length < selection.node.length && isWithin(selection.node, path)));

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
    const target = selection.target && !selection.entry && !selection.spread ? selectable.find(t => t.id === selection.target) : undefined;
    return target && !selection.onTarget && treeOf(target) ? { target, path: selection.node } : null;
  };
  const shift = (direction: -1 | 1) => { const s = selectedNode(); return !!s && edit(s.target, tree => shiftNode(tree, s.path, direction)); };
  const indent = () => { const s = selectedNode(); return !!s && edit(s.target, tree => indentNode(tree, s.path)); };
  const outdent = () => { const s = selectedNode(); return !!s && edit(s.target, tree => outdentNode(tree, s.path)); };

  // ── a row's context menu (a right click, a long press, the menu key): remove, and the hierarchy's moves ──
  type Menu = { at: Point; kind: "entry"; entry: Entry } | { at: Point; kind: "node" | "target"; target: Target; path: number[] };
  let menu = $state<Menu | null>(null);
  /** The row a finger is held on: its light cue until the menu opens */
  let pressing = $state<string | null>(null);
  let treeElement = $state<HTMLDivElement>();
  const openMenu = (at: Point, target: Target, path: number[], kind: "node" | "target") => {
    if (kind === "target") selection.selectTarget(target.id);
    else selection.selectNode(target.id, path);
    menu = { at, target, path, kind };
  };
  const openEntryMenu = (at: Point, entry: Entry) => {
    selection.set(rowSelection(entryRow(entry)));
    menu = { at, kind: "entry", entry };
  };
  const pressed = (key: string) => (on: boolean) => (pressing = on ? key : pressing === key ? null : pressing);
  const rowMenu = (target: Target, path: number[], kind: "node" | "target") =>
    menuTrigger({ open: at => openMenu(at, target, path, kind), pressing: pressed(kind === "target" ? target.id : nodeKey(target, path)) });
  const entryMenu = (entry: Entry) => menuTrigger({ open: at => openEntryMenu(at, entry), pressing: pressed(`entry:${entry.id}`) });
  /** Remove an entry with everything on it: the workspace shows the API's impact and asks first (#198) */
  const removeEntry = (entry: Entry) => void onremoveentry?.(entry.id, entry.target?.id ?? null);
  const REMOVE_ENTRY_HELP = "Removes the entry with its target, its entity and – only if you choose it – the Library files used only there. It shows what goes and asks first.";
  const menuItems = (m: Menu): MenuItem[] => {
    if (m.kind === "entry") {
      const target = m.entry.target;
      const select: MenuItem[] = target?.imageSrc
        ? [{ label: "Select the target", icon: "target", select: () => pick({ kind: "target", targetId: target.id }),
            help: "Selects the entry's target: the Entity panel shows its printed image and placement, the stage outlines its print." }]
        : [];
      return [...select, { label: "Remove entry", icon: "trash", keys: "Delete", danger: true, select: () => removeEntry(m.entry), help: REMOVE_ENTRY_HELP }];
    }
    if (m.kind === "target") {
      const entry = entryOf(m.target.id);
      return [{ label: "Remove target", icon: "trash", danger: true, select: () => { if (entry) removeEntry(entry); }, help: REMOVE_ENTRY_HELP }];
    }
    const tree = treeOf(m.target);
    const siblings = m.path.length && tree ? (nodeAt(tree, m.path.slice(0, -1))?.children?.length ?? 0) : 0;
    const last = m.path[m.path.length - 1] ?? 0;
    const moves: MenuItem[] = m.path.length
      ? [
          { label: "Move up", icon: "up", keys: "Alt ↑", disabled: last === 0 && "It is the first of its siblings.", select: () => shift(-1),
            help: "Moves the node before its previous sibling." },
          { label: "Move down", icon: "down", keys: "Alt ↓", disabled: last >= siblings - 1 && "It is the last of its siblings.", select: () => shift(1),
            help: "Moves the node after its next sibling." },
          { label: "Into the node above", icon: "next", keys: "Tab", disabled: last === 0 && "No node above it to go into.", select: indent,
            help: "Makes the node the last child of the sibling above it." },
          { label: "Out of its parent", icon: "previous", keys: "Shift Tab", select: outdent,
            help: "Makes the node its parent's next sibling; a child of the root goes next to the root, in a new group." },
        ]
      : [];
    return [...moves, { label: m.path.length ? "Remove node" : "Remove entity", icon: "trash", keys: "Delete", danger: true, select: removeSelected,
      help: m.path.length ? "Removes the node with its children – live on the stage, Save writes it." : "Removes the entity: the target keeps no AR content – live on the stage, Save writes it." }];
  };
  /** What the menu is for: the entry's title, the target's id, or the node's name */
  const menuHead = (m: Menu): string => {
    if (m.kind === "entry") return m.entry.title;
    if (m.kind === "target") return m.target.id;
    const tree = treeOf(m.target);
    const node = tree ? nodeAt(tree, m.path) : undefined;
    return node ? rowName(node, m.target, m.path) : m.target.id;
  };
  /** The menu key on the tree: the selected row's menu, at its name (the spread row has none) */
  const openKeyMenu = () => {
    const row = rows[currentRow()];
    const button = treeElement?.querySelector<HTMLElement>(".node.on .pick");
    if (!row || !button || row.kind === "spread") return;
    const rect = button.getBoundingClientRect();
    const at = { x: rect.left + Math.min(16, rect.width / 2), y: rect.top + rect.height / 2 };
    if (row.kind === "entry") {
      const entry = spread?.entries.find(e => e.id === row.entryId);
      if (entry) openEntryMenu(at, entry);
      return;
    }
    const target = selectable.find(t => t.id === row.targetId);
    if (target) openMenu(at, target, row.kind === "node" ? row.path : [], row.kind);
  };
  /** Remove the selected node (the tree's menu, Delete / Backspace): the parent is selected next, the target after the root */
  const removeSelected = () => {
    const s = selectedNode();
    if (!s || !stage) return;
    const next = stage.removeNode(s.target.id, s.path);
    if (s.path.length) selection.selectNode(s.target.id, next);
    else selection.selectTarget(s.target.id);
  };
  const entryOf = (targetId: string): Entry | undefined => spread?.entries.find(entry => entry.target?.id === targetId);

  // ── the keys: the rows as they are shown, in order – the spread, the entries, their targets and nodes (#227) ──
  const rows = $derived.by<TreeRow[]>(() =>
    treeRows(spread?.entries ?? [], {
      isOpen: entryId => !folded[entryId],
      nodes: targetId => {
        const target = selectable.find(t => t.id === targetId);
        const tree = target ? treeOf(target) : undefined;
        return tree ? visiblePaths(tree, path => !folded[nodeKey(targetId, path)]) : [];
      },
    }),
  );
  const currentRow = () => rows.findIndex(isOn);
  const selectRow = (row: TreeRow | undefined) => {
    if (row) selection.set(rowSelection(row));
  };
  /** A row's fold key and whether rows hang below it: an entry folds its target, a node its children */
  const foldOf = (row: TreeRow | undefined): { key?: string; children: boolean } => {
    if (!row) return { children: false };
    if (row.kind === "spread") return { children: !!spread?.entries.length };
    if (row.kind === "entry") return { key: row.entryId, children: !!row.targetId && selectable.some(t => t.id === row.targetId) };
    const target = selectable.find(t => t.id === row.targetId);
    const tree = target ? treeOf(target) : undefined;
    if (row.kind === "target") return { children: !!tree };
    return { key: nodeKey(row.targetId, row.path), children: !!(tree && nodeAt(tree, row.path)?.children?.length) };
  };

  const onKey = (event: KeyboardEvent) => {
    if (isMenuKey(event)) {
      // A focused row's own trigger opened its menu already
      if (!event.defaultPrevented) openKeyMenu();
      event.preventDefault();
      return;
    }
    const index = currentRow();
    const row = rows[index];
    const { key, children: hasChildren } = foldOf(row);
    const open = !!key && !folded[key];
    switch (event.key) {
      case "ArrowDown":
        if (event.altKey) { if (!shift(1)) return; break; }
        selectRow(stepRow(rows, index, 1));
        break;
      case "ArrowUp":
        if (event.altKey) { if (!shift(-1)) return; break; }
        selectRow(stepRow(rows, index, -1));
        break;
      case "ArrowLeft":
        if (event.altKey) return;
        if (key && hasChildren && open) fold(key, true);
        else selectRow(parentRow(rows, index));
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
      case "Enter": case " ": if (row) onselect?.(row.kind); break;
      case "Delete": case "Backspace": {
        // An entry goes only after the confirmation (#198); a node at once (live on the stage, Save writes it)
        const entry = row?.kind === "entry" ? spread?.entries.find(e => e.id === row.entryId) : undefined;
        if (entry) removeEntry(entry);
        else removeSelected();
        break;
      }
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
  <div class="node" class:on class:within={isWithinOn(target, path)} class:pressing={pressing === key} class:dragged={!!drag?.active && drag.target.id === target.id && isWithin(path, drag.from)}
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
    <button type="button" class="pick" class:muted={!shown} onclick={() => pick({ kind: "node", targetId: target.id, path })} aria-haspopup="menu" {@attach rowMenu(target, path, "node")}
      title={path.length
        ? `${n.type} – a tap selects this node: the Entity panel shows its values, the gizmo sits on it on the stage`
        : `${n.type} – a tap selects the entity (its root node): the Entity panel shows its values, the gizmo sits on it on the stage`}>
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
  <div class="tree" class:dragging={!!drag?.active} role="tree" aria-label="Spread tree" tabindex="0" onkeydown={onKey} bind:this={treeElement}
    onpointerdown={dragDown} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} onlostpointercapture={dragUp} onclickcapture={dragClick}
    data-help-name="Tree" data-help="A tap selects the spread, an entry, a target, its entity or a node: the row is highlighted and the panel follows – the spread opens the Stage tab at its section, the others the Entity panel; an entry with a target and a target are outlined on the stage, a node carries the gizmo. Drag a node onto a row to make it that node's child, between two rows to make it a sibling there (with a finger, drag its icon). Keys: ↑ ↓ walk the rows, ← → fold or step a level up and down, Alt + ↑ ↓ move a node, Tab / Shift + Tab indent / outdent, Enter opens the row's panel, Delete removes a node – on an entry it shows what goes and asks first. A row's menu – a right click, a long press, or the menu key – has the moves and the removal.">
    <div class="node" class:on={spreadOn} role="treeitem" aria-expanded="true" aria-selected={spreadOn} aria-level={1}>
      <span class="chevron"></span>
      <span class="type"><Icon name="book" size="1em" stroke={2} /></span>
      <button type="button" class="pick" onclick={() => pick({ kind: "spread" })}
        title="The spread – a tap selects it: the Stage tab opens at its section – title, pages, format, post-processing and environment">
        <span class="name">{spread.title}</span>
        {#if spread.title.replace(/[-–—]/g, "–") !== pages}<span class="small muted">{pages}</span>{/if}
      </button>
      <span class="eye"></span>
    </div>
    {#each spread.entries as entry (entry.id)}
      {@const target = entry.target}
      {@const open = !folded[entry.id]}
      {@const shown = !!target && !preview.hidden.includes(target.id)}
      {@const tree = target ? treeOf(target) : undefined}
      {@const entryOn = isOn(entryRow(entry))}
      <div class="node depth-1" class:on={entryOn} class:within={!!target && (isTargetOn(target) || isWithinOn(target, null))} class:pressing={pressing === `entry:${entry.id}`}
        role="treeitem" aria-expanded={target ? open : undefined} aria-selected={entryOn} aria-level={2}>
        {@render guides(1)}
        {#if target}
          <button type="button" class="chevron" onclick={() => fold(entry.id)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
        {:else}
          <span class="chevron"></span>
        {/if}
        <span class="type"><Icon name="entry" size="1em" stroke={2} /></span>
        <button type="button" class="pick" class:muted={!!target && !shown} onclick={() => pick(entryRow(entry))} aria-haspopup="menu" {@attach entryMenu(entry)}
          title={entryRowHelp(entry, !!target?.imageSrc)}>
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
        <div class="node depth-2" class:on class:within={isWithinOn(target, null)} class:pressing={pressing === target.id} role="treeitem" aria-selected={on} aria-level={3}>
          {@render guides(2)}
          <span class="chevron"></span>
          <span class="type"><Icon name="target" size="1em" stroke={2} /></span>
          <button type="button" class="pick" class:muted={!shown} onclick={() => pick({ kind: "target", targetId: target.id })} aria-haspopup="menu" {@attach rowMenu(target, [], "target")}
            title={tree
              ? "The target – a tap selects it: the Entity panel shows its printed image and placement, the stage outlines its print"
              : "The target, no AR content yet – a tap selects it: the Entity panel shows its printed image and placement and adds a node, the stage outlines its print"}>
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
        <button type="button" class="pick" onclick={onaddtarget} title="A tap opens the form for a new entry with a printed image on this spread"><span class="name">+ target</span></button>
      </div>
    {/if}
  </div>
{/if}

{#if menu}
  <ContextMenu at={menu.at} label={menu.kind === "entry" ? "Entry" : menu.kind === "target" ? `Target ${menu.target.id}` : "Node"} head={menuHead(menu)} items={menuItems(menu)}
    returnFocus={treeElement} onclose={() => (menu = null)} />
{/if}

<style>
  .tree { display: flex; flex-direction: column; --indent: 1.125rem; --cell: 1.125rem; outline: none; }
  .tree.dragging { cursor: grabbing; user-select: none; }
  .node { position: relative; display: flex; align-items: center; gap: .25rem; height: 1.5rem; padding: 0 .25rem; }
  .node:nth-child(even) { background: var(--surface-head); }
  .node.within { background: var(--within-background); }
  @media (hover: hover) {
    .node:hover { background: var(--hover-background); }
  }
  .node.pressing { background: var(--hover-background); }
  .node.on { background: var(--selected-background); color: var(--pressed-color); box-shadow: inset 2px 0 0 var(--text); }
  .tree:focus-visible .node.on { box-shadow: inset 2px 0 0 var(--text), inset 0 0 0 1px var(--text); }
  .node.dragged { opacity: .45; }
  .node.drop-before { box-shadow: inset 0 2px 0 var(--text); }
  .node.drop-after { box-shadow: inset 0 -2px 0 var(--text); }
  .node.drop-inside { box-shadow: inset 0 0 0 2px var(--text); }
  .depth-1 { padding-left: calc(.25rem + var(--indent)); }
  .depth-2 { padding-left: calc(.25rem + 2 * var(--indent)); }
  .guide { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--line); pointer-events: none; }
  .chevron, .type, .eye { flex: none; width: var(--cell); height: var(--cell); display: inline-flex; align-items: center; justify-content: center; }
  .chevron, .type { color: var(--muted); }
  /* A finger drags a node by its icon without scrolling the tree */
  .type.handle { cursor: grab; touch-action: none; }
  button.chevron, button.eye { padding: 0; border: none; background: none; color: var(--muted); cursor: pointer; border-radius: var(--control-radius); }
  @media (hover: hover) {
    button.chevron:hover, button.eye:hover { color: var(--text); }
  }
  button.eye[aria-pressed="true"] { color: var(--text); }
  .on .chevron, .on .type { color: var(--pressed-color); }
  /* A held finger opens the row's menu: no text selection, no callout */
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: .375rem; height: var(--cell); padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .pick:disabled { cursor: default; }
  .pick.muted { color: var(--muted); }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { font-size: .6em; }
  .add-target { padding-left: calc(.25rem + var(--indent)); color: var(--muted); }
  @media (hover: hover) {
    .add-target:hover { color: var(--text); }
  }
  @media (pointer: coarse) {
    .tree { --cell: 1.75rem; }
    .node { height: var(--control-height); }
    .pick { height: 100%; }
    button.chevron, button.eye { height: 100%; }
    .eye { width: var(--control-height); margin-right: -.25rem; }
  }
</style>
