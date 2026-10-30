<script lang="ts">
  import { onMount, tick } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { content } from "#lib/content.svelte.js";
  import { Stage, type PickMode, type StagePick } from "#lib/stage/stage.svelte.js";
  import { GIZMO_KEYS, GIZMO_MODES, type GizmoMode } from "#lib/stage/gizmo.js";
  import { SHADING_MODES, updatePreview, type ShadingMode } from "#lib/stage/preview.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import StagePanel from "#lib/panels/StagePanel.svelte";
  import EntityPanel from "#lib/panels/EntityPanel.svelte";
  import TreePanel from "#lib/panels/TreePanel.svelte";
  import LibraryPanel from "#lib/panels/LibraryPanel.svelte";
  import CodePanel from "#lib/panels/CodePanel.svelte";
  import EnvironmentPanel from "#lib/panels/EnvironmentPanel.svelte";
  import { environmentEdit } from "#lib/environment.svelte.js";
  import NewTargetForm from "#lib/panels/NewTargetForm.svelte";
  import { deleteEntry, putTarget, type Asset } from "#lib/api.js";
  import { library } from "#lib/library.svelte.js";
  import { nodeAt } from "#lib/values.js";
  import { selection } from "#lib/selection.svelte.js";
  import InfoView from "#lib/components/InfoView.svelte";
  import { clampSheet, clampWidth, LIMITS, maxWidth, SHEET_MAX, snapSheet, stepsOnTop, treeStartsOpen, widths, wordTabs, wrapRows, type Column } from "#lib/widths.svelte.js";

  /**
   * The workspace: the **tree** of the spread at the left (a 3D tool's outliner, collapsible to its bar), the stage
   * (the engine over the mock stage) and the panels **Stage**, **Entity**, **Environment**, **Library** and **Code** in a column at the right. On a phone the
   * panel is a sheet at the bottom whose head is the tab row (closed = the row only) and the tree is its first tab.
   * `?tab=environment` opens a tab (the book page links the Environment so). On a desktop the tree's right edge and
   * the panel's left edge are dragged to resize the columns (`widths`; the Code tab has its own, wider width), a
   * double-click on an edge restores the default; the stage's view follows its container. On a phone the sheet's head
   * (a grip and the tab row) is dragged up or down to any height and snaps when let go (#155); a double tap on the
   * grip restores the default height.
   */
  const bookId = $derived(page.params.book!);
  const spreadId = $derived(page.params.spread!);
  const TABS = ["tree", "stage", "entity", "environment", "library", "code"] as const;
  type Tab = (typeof TABS)[number];
  const TAB_KEY = "osct-editor-tab";
  /** The tab row: the word on a desktop, the icon on a phone (Tilman 2026-10-30) */
  const TAB_BUTTONS: { tab: Tab; label: string; icon: IconName; title?: string }[] = [
    { tab: "tree", label: "Tree", icon: "list" },
    { tab: "stage", label: "Stage", icon: "sliders" },
    { tab: "entity", label: "Entity", icon: "model" },
    { tab: "environment", label: "Environment", icon: "globe", title: "The world around the reader and its sky, previewed on the stage" },
    { tab: "library", label: "Library", icon: "folder" },
    { tab: "code", label: "Code", icon: "code" },
  ];
  const TREE_KEY = "osct-editor-tree";
  const NARROW = "(max-width: 47.9rem)";
  const COARSE = "(pointer: coarse)";

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  const firstTab = ((): Tab => {
    const asked = page.url.searchParams.get("tab") as Tab | null;
    if (asked && TABS.includes(asked)) return asked;
    try { const t = localStorage.getItem(TAB_KEY) as Tab | null; return t && TABS.includes(t) ? t : "stage"; } catch { return "stage"; }
  })();
  let tab = $state<Tab | null>(firstTab);
  /** The tree column is open (desktop; stored – until then open in a wide window only, #172) */
  let treeOpen = $state(treeStartsOpen(window.innerWidth, (() => { try { return localStorage.getItem(TREE_KEY); } catch { return null; } })()));
  /** A phone: the tree is a tab of the sheet instead of a column; × ‹ › leave the sheet's head (#171) */
  let narrow = $state(false);
  /** A finger: every control is the touch height (app.css), so the tab row needs more room for its words */
  let coarse = $state(window.matchMedia(COARSE).matches);
  // The one selection of the tree, the stage and the Entity panel – a target, its entity or a node (#162)
  selection.reset();
  let loadError = $state<string | null>(null);

  /** The tab the sheet opens with when it is dragged open (the last one shown) */
  let lastTab: Tab = firstTab;
  const setTab = (next: Tab) => {
    tab = tab === next ? null : next;
    if (tab) lastTab = tab;
    try { if (tab) localStorage.setItem(TAB_KEY, tab); else localStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ }
  };
  /** Show a tab (no toggle – a panel's link to another) */
  const openTab = (next: Tab) => {
    if (tab !== next) setTab(next);
  };
  const setTreeOpen = (open: boolean) => {
    treeOpen = open;
    try { localStorage.setItem(TREE_KEY, open ? "open" : "closed"); } catch { /* storage blocked */ }
  };
  /** The tab the panel shows: on a desktop the tree has its own column, so a stored "tree" shows the stage */
  const shown = $derived<Tab | null>(tab === "tree" && !narrow ? "stage" : tab);
  const select = () => { if (shown !== "entity") setTab("entity"); };

  // ── the columns' widths: the edges are dragged (pointer or arrow keys), a double-click restores the default ──
  let workspace = $state<HTMLDivElement>();
  let viewport = $state(window.innerWidth);
  let dragging = $state<Column | null>(null);
  const panelColumn = $derived<Column>(shown === "code" ? "code" : "panel");
  const treeShown = $derived(treeOpen && !narrow);
  /** The panel's width leaves room for the tree's own (clamped alone); the tree's then fits next to the panel */
  const panelWidth = $derived(widths.width(panelColumn, viewport, treeShown ? widths.width("tree", viewport) : 0));
  const treeWidth = $derived(widths.width("tree", viewport, panelWidth));
  /** The tabs as icons: on a phone, and in a panel too narrow for the words, so the head stays one line (#172) */
  const iconTabs = $derived(narrow || !wordTabs(panelWidth, coarse));
  const widthOf = (column: Column) => (column === "tree" ? treeWidth : panelWidth);
  /** The other column's width: the stage keeps its room between both */
  const otherOf = (column: Column) => (column === "tree" ? panelWidth : treeShown ? treeWidth : 0);
  const resizeTo = (column: Column, width: number) => widths.set(column, clampWidth(column, width, viewport, otherOf(column)));
  const startDrag = (column: Column, event: PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = column;
    event.preventDefault();
  };
  const drag = (event: PointerEvent) => {
    if (!dragging || !workspace) return;
    const rect = workspace.getBoundingClientRect();
    resizeTo(dragging, dragging === "tree" ? event.clientX - rect.left : rect.right - event.clientX);
  };
  const endDrag = () => {
    if (!dragging) return;
    widths.save();
    dragging = null;
  };
  /** ← → move the focused edge (Shift: further); the tree's edge grows to the right, the panel's to the left */
  const edgeKey = (column: Column, event: KeyboardEvent) => {
    const step = event.shiftKey ? 64 : 16;
    const grow = column === "tree" ? 1 : -1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      resizeTo(column, widthOf(column) + (event.key === "ArrowRight" ? grow : -grow) * step);
      widths.save();
      event.preventDefault();
      event.stopPropagation(); // not the spreads' ← →
    }
  };
  // ── the phone's sheet (#155): its head (the grip and the tab row) is dragged to any height; a movement beyond
  // DRAG_PX tells a drag from a tap on a tab; let go, it snaps (a flick carries it on); closed = the tab row only ──
  const DRAG_PX = 8;
  /** The panel the open sheet shows at least under its head (px) */
  const SHEET_BODY_MIN = 64;
  const DOUBLE_TAP_MS = 350;
  let screenHeight = $state(window.innerHeight);
  /** The sheet's head (grip and tab row), px */
  let headHeight = $state(0);
  let sheetDragging = $state(false);
  /** The sheet's row while it is dragged (px): the stage keeps its size and the sheet slides over it; let go, it resizes once */
  let sheetRow = $state(0);
  const sheetMin = $derived(Math.min(SHEET_MAX, (headHeight + SHEET_BODY_MIN) / Math.max(1, screenHeight)));
  const sheetShare = $derived(widths.sheet(sheetMin));
  const sheetHeight = $derived(Math.round(sheetShare * screenHeight));
  let sheetDrag: { id: number; startY: number; startHeight: number; moved: boolean; lastY: number; lastT: number; velocity: number; raw: number } | null = null;
  /** The click that ends a drag is no tap on a tab */
  let swallowClick = false;
  let lastTap = 0;
  const closeSheet = () => { if (tab) setTab(tab); };
  const openSheet = () => { if (shown === null) openTab(lastTab); };
  const sheetDown = (event: PointerEvent) => {
    swallowClick = false;
    if (!narrow || event.button !== 0) return;
    const startHeight = shown === null ? headHeight : sheetHeight;
    sheetDrag = { id: event.pointerId, startY: event.clientY, startHeight, moved: false, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, raw: startHeight / screenHeight };
  };
  const sheetMove = (event: PointerEvent) => {
    const d = sheetDrag;
    if (!d || event.pointerId !== d.id) return;
    if (!d.moved) {
      if (Math.abs(event.clientY - d.startY) < DRAG_PX) return;
      d.moved = true;
      sheetRow = ((event.currentTarget as HTMLElement).closest(".panel") as HTMLElement | null)?.offsetHeight ?? d.startHeight;
      sheetDragging = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (d.lastY - event.clientY) / screenHeight / (dt / 1000);
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    const height = d.startHeight + d.startY - event.clientY;
    d.raw = height / screenHeight;
    if (height > headHeight + DRAG_PX) {
      openSheet();
      widths.setSheet(clampSheet(d.raw, sheetMin));
    }
  };
  const sheetUp = (event: PointerEvent) => {
    const d = sheetDrag;
    if (!d || event.pointerId !== d.id) return;
    // A touch is captured by the element it starts on (the grip, a tab): taking the capture for the head makes that
    // element lose it, and its lostpointercapture bubbles up here – that is no end of the drag (it ended every touch
    // drag after its first step)
    if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
    sheetDrag = null;
    if (d.moved) {
      sheetDragging = false;
      swallowClick = true;
      // Held still before letting go: no flick
      const snap = snapSheet(d.raw, event.timeStamp - d.lastT > 100 ? 0 : d.velocity);
      if (snap === 0) closeSheet();
      else {
        openSheet();
        widths.setSheet(clampSheet(snap, sheetMin));
        widths.save();
      }
      return;
    }
    if (event.type !== "pointerup" || (event.target as HTMLElement).closest("button, a")) return;
    // Two taps on the head beside the tabs: the default height
    if (event.timeStamp - lastTap < DOUBLE_TAP_MS) {
      lastTap = 0;
      widths.resetSheet();
      openSheet();
    } else lastTap = event.timeStamp;
  };
  const sheetClick = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  };
  /** ↑ ↓ on the focused grip (Shift: further); below its lowest the sheet closes, ↑ opens it again */
  const sheetKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    const up = event.key === "ArrowUp";
    if (shown === null) {
      if (up) openSheet();
      return;
    }
    if (!up && sheetShare <= sheetMin + 0.001) closeSheet();
    else {
      widths.setSheet(clampSheet(sheetShare + (up ? 1 : -1) * (event.shiftKey ? 0.15 : 0.05), sheetMin));
      widths.save();
    }
  };
  const SHEET_HELP = "Drag the tab row or this grip up or down to make the panel taller or shorter (↑ ↓ when focused, Shift for larger steps); it snaps to closed, a third, half or almost full, and the height is remembered in this browser. A double tap restores the default height.";

  const EDGE_HELP = "Drag to make the column wider or narrower (← → when focused, Shift for larger steps); the width is remembered in this browser. A double-click restores the default width.";

  // ── targets: the form, removal, a changed image or placement ──
  let addingTarget = $state(false);
  let entityPanel = $state<{ useAsset: (kind: Asset["kind"], src: string, assetId: string) => void }>();
  /** The content changed under the stage (a target's image or placement, a relink): reload it and build the spread again */
  const reloadContent = async () => {
    await content.load(bookId);
    await stage?.refresh();
    void library.refresh();
  };
  const targetCreated = async (targetId: string) => {
    addingTarget = false;
    await reloadContent();
    selection.selectTarget(targetId);
    setTab("entity");
  };
  const removeTarget = async (target: { id: string; entryId: string }) => {
    if (!window.confirm(`Remove the target ${target.id} and its entry? The draft loses both (Publish makes it final).`)) return;
    await deleteEntry(bookId, target.entryId);
    if (selection.target === target.id) selection.reset();
    await reloadContent();
  };
  // ── the environment: previewed on the stage while its tab is open (its Library picker included) ──
  $effect(() => {
    stage?.previewEnvironment(shown === "environment" ? $state.snapshot(environmentEdit.edited) : null);
  });
  $effect(() => {
    if (shown !== "environment") environmentEdit.picking = null;
  });

  /** The library's Use: the selected node takes the file (the Entity panel shows first – the Library tab replaced it) */
  const useAsset = async (asset: Asset) => {
    openTab("entity");
    await tick();
    entityPanel?.useAsset(asset.kind, asset.url, asset.id);
  };
  const useAsTargetImage = async (asset: Asset) => {
    if (!selection.target) return;
    await putTarget(bookId, selection.target, { imageSrc: asset.url });
    await reloadContent();
  };
  const selectedNodeType = $derived.by(() => {
    const t = selection.target && !selection.onTarget ? stage?.treeOf(selection.target) : undefined;
    return t ? (nodeAt(t, selection.node) ?? t).type : null;
  });

  onMount(() => {
    let disposed = false;
    const media = window.matchMedia(NARROW);
    narrow = media.matches;
    const onMedia = (event: MediaQueryListEvent) => (narrow = event.matches);
    media.addEventListener("change", onMedia);
    const pointer = window.matchMedia(COARSE);
    const onPointer = (event: MediaQueryListEvent) => (coarse = event.matches);
    pointer.addEventListener("change", onPointer);
    (async () => {
      if (content.bookId !== bookId) {
        const error = await content.load(bookId);
        if (error) {
          loadError = `${error.msg}${error.details?.[0] ? ` – ${error.details[0]}` : ""}`;
          return;
        }
      }
      if (disposed || !container) return;
      stage = new Stage(container);
      stage.onPick = hit => {
        stageMenu = null;
        if (!hit) return;
        selectHit(hit);
        select();
      };
      stage.onContextMenu = (hit, x, y) => {
        if (hit) selectHit(hit);
        stageMenu = { hit, x: Math.min(x, window.innerWidth - 200), y: Math.min(y, window.innerHeight - 160) };
      };
      await stage.open(spreadId);
    })();
    return () => {
      disposed = true;
      media.removeEventListener("change", onMedia);
      pointer.removeEventListener("change", onPointer);
      void stage?.dispose();
      stage = null;
    };
  });

  // The route's spread changed (‹ › or the URL): the stage follows
  $effect(() => {
    const id = spreadId;
    if (stage && stage.spreadId !== id) void stage.open(id);
  });
  /** A pick on the stage: the printed image selects the target, an entity's node the node (the pick mode decides which) */
  const selectHit = (hit: StagePick) => {
    if (hit.printed) selection.selectTarget(hit.targetId);
    else selection.selectNode(hit.targetId, hit.path);
  };
  // The gizmo sits on the selected node; a selected target's print is outlined instead
  $effect(() => {
    const id = selection.target;
    const path = selection.node;
    const level = stage && stage.status === "running" ? selection.level(!!(id && stage.treeOf(id))) : "none";
    stage?.selectNode(level === "entity" || level === "node" ? id : null, path);
    stage?.selectTarget(level === "target" ? id : null);
  });
  const GIZMO_LABELS: Record<GizmoMode, string> = { translate: "Move (W)", rotate: "Rotate (E)", scale: "Scale (R)" };
  const PICK_MODES: readonly PickMode[] = ["entity", "node", "target"];
  const PICK_LABELS: Record<PickMode, string> = { entity: "Select entities – a click picks the entity (its root)", node: "Select nodes – a click picks the node under the pointer", target: "Select targets – a click picks the printed target" };
  const SHADING_LABELS: Record<ShadingMode, string> = { wireframe: "Wireframe – the entities as lines", solid: "Solid – one grey, the scene's lights", textured: "Textured – the content's materials, no sky", rendered: "Rendered – the HDRI's sky and light" };
  const SHADING_ICONS: Record<ShadingMode, IconName> = { wireframe: "shade-wire", solid: "shade-solid", textured: "shade-textured", rendered: "shade-rendered" };
  const PICK_ICONS: Record<PickMode, IconName> = { entity: "package", node: "node", target: "target" };

  // ── the stage's menu (right click): what lies there decides the actions ──
  let stageMenu = $state<{ hit: StagePick | null; x: number; y: number } | null>(null);
  const menuRemoveNode = () => {
    stageMenu = null;
    // A picked print: its entity goes (the menu says "Remove entity")
    const id = selection.target;
    if (id && selection.onTarget) selection.selectNode(id, []);
    removeSelectedNode();
  };
  /** Remove the selected node (the stage's menu, Delete): its parent is selected next, the target after the root */
  const removeSelectedNode = () => {
    const id = selection.target;
    if (!stage || !id || selection.onTarget || !stage.treeOf(id)) return false;
    const next = stage.removeNode(id, selection.node);
    if (selection.node.length) selection.selectNode(id, next);
    else selection.selectTarget(id);
    return true;
  };
  const menuAddNode = () => {
    stageMenu = null;
    // A target with AR content adds to its entity: the root is selected (the Entity panel's "+ node" shows)
    const id = selection.target;
    if (id && selection.onTarget && stage?.treeOf(id)) selection.selectNode(id, []);
    setTab("entity");
    requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('select[aria-label="New node type"]')?.focus());
  };
  const menuPlacement = () => {
    stageMenu = null;
    // The placement is the target's: its level opens
    if (selection.target) selection.selectTarget(selection.target);
    setTab("entity");
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("button.placement-toggle")?.click());
  };
  const NAVIGATION_HELP = "Drag = orbit · Shift-drag, the middle button or two fingers = pan · wheel / pinch = distance · double tap = the reader's view · ← → = the spreads. A click picks what lies there, right click opens its menu.";
  const GIZMO_ICONS: Record<GizmoMode, "move" | "rotate" | "scale"> = { translate: "move", rotate: "rotate", scale: "scale" };

  const spread = $derived(content.spread(spreadId));

  // ── the phone's ‹ › (#177): at the stage's lower corners while the stage holds them below the wrapped toolbar;
  // on a shorter stage (the sheet almost full) they share the stage's top row with the toolbar, which then keeps
  // to one row and scrolls sideways – the tools stay reachable at every sheet height ──
  let tools = $state<HTMLDivElement>();
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let stepsUp = $state(false);
  /** The toolbar's wrapped height and one row's (px) on a stage `width` px wide, from its groups (the same in both layouts) */
  const wrappedToolbar = (bar: HTMLElement, width: number, rem: number) => {
    const px = (value: string) => parseFloat(value) || 0;
    const style = getComputedStyle(bar);
    const groups = [...bar.children] as HTMLElement[];
    const outer = groups.map(group => {
      const s = getComputedStyle(group);
      return group.getBoundingClientRect().width + px(s.marginLeft) + px(s.marginRight);
    });
    const chromeX = px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
    const chromeY = px(style.paddingTop) + px(style.paddingBottom) + px(style.borderTopWidth) + px(style.borderBottomWidth);
    const row = Math.max(0, ...groups.map(group => group.offsetHeight));
    // the toolbar's max-width is the stage's less 1rem
    const rows = wrapRows(outer, width - rem - chromeX, px(style.columnGap));
    return { height: rows * row + Math.max(0, rows - 1) * px(style.rowGap) + chromeY, row };
  };
  $effect(() => {
    const [bar, width, height] = [tools, stageWidth, stageHeight];
    void coarse;
    if (!narrow || !bar || !height) {
      stepsUp = false;
      return;
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const toolbar = wrappedToolbar(bar, width, rem);
    stepsUp = stepsOnTop(height, toolbar.height, toolbar.row, rem / 2);
  });

  const step = (direction: 1 | -1) => {
    const next = content.neighbour(spreadId, direction);
    if (next) void goto(resolve(`${bookId}/${next.id}/`), { replace: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Control") stage?.setSnap(true);
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
    const mode = GIZMO_KEYS[event.key.toLowerCase()];
    if (mode && !event.ctrlKey && !event.metaKey && !event.altKey) stage?.setGizmoMode(mode);
    // Delete removes the selected node (the tree does the same when it has the focus and stops the event)
    if ((event.key === "Delete" || event.key === "Backspace") && removeSelectedNode()) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Control") stage?.setSnap(false);
  };

  // ── Pick a colour from the stage (the colour field's eyedropper): an overlay over the stage shows the colour under
  // the pointer in a chip; a tap takes it, Esc cancels. The overlay is app UI (role dialog), so the tracker ignores it.
  let picking = $state<((hex: string | null) => void) | null>(null);
  let pickHex = $state<string | null>(null);
  let pickAt = $state({ x: 0, y: 0 });
  let picker = $state<HTMLDivElement>();
  const pickColour = () => new Promise<string | null>(resolve => {
    picking = resolve;
    pickHex = null;
    requestAnimationFrame(() => picker?.focus());
  });
  const endPick = (hex: string | null) => {
    picking?.(hex);
    picking = null;
    pickHex = null;
  };
  const samplePick = (event: PointerEvent) => {
    if (!container || !stage) return;
    const rect = container.getBoundingClientRect();
    pickAt = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pickHex = stage.sampleColor(pickAt.x, pickAt.y);
  };
</script>

<svelte:window bind:innerWidth={viewport} bind:innerHeight={screenHeight} onkeydown={onKey} onkeyup={onKeyUp} onblur={() => stage?.setSnap(false)} />

{#snippet edge(column: Column, name: string)}
  <!-- A focusable separator is a control (a window splitter): it takes the pointer, a double-click and the arrow keys -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="edge {column === 'tree' ? 'edge-right' : 'edge-left'}" class:on={dragging === column}
    role="separator" aria-orientation="vertical" aria-label={name} tabindex="0" data-app-ui data-help-name={name} data-help={EDGE_HELP}
    aria-valuenow={widthOf(column)} aria-valuemin={LIMITS[column].min} aria-valuemax={maxWidth(column, viewport, otherOf(column))}
    onpointerdown={e => startDrag(column, e)} onpointermove={drag} onpointerup={endDrag} onpointercancel={endDrag} onlostpointercapture={endDrag}
    ondblclick={() => widths.reset(column)} onkeydown={e => edgeKey(column, e)}></div>
{/snippet}

<div class="workspace" class:closed={shown === null} class:tree-closed={!treeOpen} class:dragging class:sheet-dragging={sheetDragging} bind:this={workspace}
  style:--panel-width="{panelWidth}px" style:--tree-width={treeShown ? `${treeWidth}px` : undefined}
  style:--sheet-height={narrow && shown !== null ? `${sheetHeight}px` : undefined} style:--sheet-row={sheetDragging ? `${sheetRow}px` : undefined}>
  <aside class="tree" data-app-ui>
    <div class="bar">
      {#if treeOpen}<span class="section-label grow">tree</span>{/if}
      <button type="button" class="icon-button" onclick={() => setTreeOpen(!treeOpen)} title={treeOpen ? "Hide the tree" : "Show the tree"} aria-label={treeOpen ? "Hide the tree" : "Show the tree"} aria-expanded={treeOpen}>
        <Icon name={treeOpen ? "previous" : "next"} />
      </button>
    </div>
    {#if treeOpen}
      <div class="body tree-body"><TreePanel {stage} {spreadId} onselect={select} onaddtarget={() => { addingTarget = true; }} onremovetarget={removeTarget} /></div>
      <InfoView />
      {#if treeShown}{@render edge("tree", "Tree edge")}{/if}
    {/if}
  </aside>

  <div class="stage" class:steps-up={narrow && stepsUp} bind:this={container} bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}
    data-help-name="Stage" data-help={NAVIGATION_HELP}>
    {#if stage && stage.status === "running"}
      <!-- Three groups that wrap whole when the stage is narrow (a phone with the touch height – #171) -->
      <div class="tools" role="toolbar" data-app-ui aria-label="Transform" bind:this={tools}>
        <span class="tool-group" role="group" aria-label="Gizmo">
          {#each GIZMO_MODES as mode (mode)}
            <button type="button" class="icon-button" class:on={stage.gizmoMode === mode} aria-pressed={stage.gizmoMode === mode} title="{GIZMO_LABELS[mode]} – Ctrl snaps" aria-label={GIZMO_LABELS[mode]}
              onclick={() => stage?.setGizmoMode(mode)}><Icon name={GIZMO_ICONS[mode]} stroke={2} /></button>
          {/each}
        </span>
        <span class="tool-group" role="group" aria-label="Pick mode">
          {#each PICK_MODES as mode (mode)}
            <button type="button" class="icon-button" class:on={stage.pickMode === mode} aria-pressed={stage.pickMode === mode} title={PICK_LABELS[mode]} aria-label={PICK_LABELS[mode]} onclick={() => stage?.setPickMode(mode)}><Icon name={PICK_ICONS[mode]} stroke={2} /></button>
          {/each}
        </span>
        <span class="tool-group shading" role="group" aria-label="Viewport shading">
          {#each SHADING_MODES as mode (mode)}
            <button type="button" class="icon-button" class:on={stage.shading === mode} aria-pressed={stage.shading === mode} title={SHADING_LABELS[mode]} aria-label={SHADING_LABELS[mode]} onclick={() => updatePreview({ shading: mode })}><Icon name={SHADING_ICONS[mode]} stroke={1.75} /></button>
          {/each}
        </span>
      </div>
      {#if narrow}
        <!-- A phone: ‹ › through the spreads at the stage's lower corners, out of the sheet's head (#171); on a short
             stage at its top right, beside the toolbar (#177) -->
        <button type="button" class="icon-button framed step step-previous" data-app-ui onclick={() => step(-1)}
          title="Previous spread" aria-label="Previous spread"><Icon name="previous" /></button>
        <button type="button" class="icon-button framed step step-next" data-app-ui onclick={() => step(1)}
          title="Next spread" aria-label="Next spread"><Icon name="next" /></button>
      {/if}
      {#if stageMenu}
        <button type="button" class="menu-backdrop" aria-label="Close the menu" onclick={() => (stageMenu = null)} oncontextmenu={e => { e.preventDefault(); stageMenu = null; }}></button>
        <div class="menu" role="menu" data-app-ui style:left="{stageMenu.x}px" style:top="{stageMenu.y}px">
          {#if stageMenu.hit}
            {@const hit = stageMenu.hit}
            {@const hasTree = !!stage.treeOf(hit.targetId)}
            <span class="menu-head small muted">{hit.targetId}{hit.path.length ? ` › ${hit.path.join(" › ")}` : ""}</span>
            <button type="button" role="menuitem" class="menu-item" onclick={menuAddNode}>{hasTree ? "Add node…" : "Add AR content…"}</button>
            {#if hasTree}<button type="button" role="menuitem" class="menu-item" onclick={menuRemoveNode}>{hit.path.length ? "Remove node" : "Remove entity"}</button>{/if}
            <button type="button" role="menuitem" class="menu-item" onclick={menuPlacement}>Placement on the page…</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; stage?.replayUnlock(); }}>Replay the first find</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; setTab("library"); }}>Library…</button>
            <button type="button" role="menuitem" class="menu-item danger" onclick={() => { const t = content.spread(spreadId)?.targets.find(x => x.id === hit.targetId); stageMenu = null; if (t) void removeTarget(t); }}>Remove target</button>
          {:else}
            <span class="menu-head small muted">{spread?.title ?? spreadId}</span>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; addingTarget = true; }}>+ target…</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; stage?.replayUnlock(); }}>Replay the first find</button>
            <button type="button" role="menuitem" class="menu-item" onclick={() => { stageMenu = null; setTab("stage"); }}>Stage settings…</button>
          {/if}
        </div>
      {/if}
    {/if}
    {#if loadError}
      <p class="notice danger">{loadError}</p>
    {:else if !stage || stage.status === "idle" || stage.status === "loading" || stage.status === "starting"}
      <p class="notice muted">{content.loading ? "Loading the draft…" : "Building the stage…"}</p>
    {:else if stage.status === "error"}
      <p class="notice danger">{stage.error}</p>
    {/if}
    {#if picking}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div bind:this={picker} class="picker" role="dialog" aria-label="Pick a colour from the stage – tap to take it, Esc to cancel" tabindex="-1"
        onpointermove={samplePick} onpointerdown={samplePick} onclick={() => endPick(pickHex)} onkeydown={e => { if (e.key === "Escape") endPick(null); }}>
        {#if pickHex}<span class="pick-chip" style:left="{pickAt.x + 16}px" style:top="{pickAt.y + 16}px" style:--c={pickHex}>{pickHex}</span>{/if}
      </div>
    {/if}
  </div>

  <aside class="panel" data-app-ui>
    {#if !narrow}{@render edge(panelColumn, "Panel edge")}{/if}
    <!-- On a phone the head is the sheet's grip: a drag sets its height, a tap on a tab still opens or closes it -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="head" bind:offsetHeight={headHeight} onpointerdown={sheetDown} onpointermove={sheetMove} onpointerup={sheetUp}
      onpointercancel={sheetUp} onlostpointercapture={sheetUp} onclickcapture={sheetClick}>
    {#if narrow}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div class="grip" class:on={sheetDragging} role="separator" aria-orientation="horizontal" aria-label="Panel height" tabindex="0"
        data-help-name="Panel height" data-help={SHEET_HELP} aria-valuenow={shown === null ? 0 : Math.round(sheetShare * 100)} aria-valuemin={0}
        aria-valuemax={Math.round(SHEET_MAX * 100)} aria-valuetext={shown === null ? "closed" : `${Math.round(sheetShare * 100)} % of the screen`}
        onkeydown={sheetKey}></div>
    {/if}
    <div class="bar" class:icons={iconTabs}>
      {#if !narrow}
        <!-- A phone has the top bar's book link for ×, and ‹ › on the stage: its head is the tabs alone (#171) -->
        <a href={resolve(`${bookId}/`)} class="icon-button" title="Back to the spreads" aria-label="Back to the spreads"><Icon name="close" /></a>
        <button type="button" class="icon-button" onclick={() => step(-1)} title="Previous spread (←)" aria-label="Previous spread"><Icon name="previous" /></button>
        <button type="button" class="icon-button" onclick={() => step(1)} title="Next spread (→)" aria-label="Next spread"><Icon name="next" /></button>
        <span class="grow"></span>
      {/if}
      {#each TAB_BUTTONS as b (b.tab)}
        {#if b.tab !== "tree" || narrow}
          <!-- A phone, or a panel too narrow for the words, shows the tabs as icons, so the row stays one line (the
               name is the tooltip and the label – #172) -->
          <button type="button" class="pill tab" class:icon-tab={iconTabs} class:on={shown === b.tab} aria-pressed={shown === b.tab}
            aria-label={iconTabs ? b.label : undefined} title={iconTabs ? `${b.label}${b.title ? ` – ${b.title}` : ""}` : b.title}
            onclick={() => setTab(b.tab)}>{#if iconTabs}<Icon name={b.icon} />{:else}{b.label}{/if}</button>
        {/if}
      {/each}
    </div>
    </div>
    {#if addingTarget && spread}
      <div class="body"><NewTargetForm {bookId} {spread} {stage} oncreated={targetCreated} oncancel={() => (addingTarget = false)} /></div>
    {:else if shown === "tree"}
      <div class="body"><TreePanel {stage} {spreadId} onselect={select} onaddtarget={() => (addingTarget = true)} onremovetarget={removeTarget} /></div>
    {:else if shown === "stage"}
      <div class="body"><StagePanel {stage} {bookId} {spreadId} /></div>
    {:else if shown === "entity"}
      <div class="body"><EntityPanel bind:this={entityPanel} {stage} {bookId} {spreadId} bind:selected={selection.target} bind:node={selection.node} {pickColour} ontargetchanged={reloadContent} /></div>
    {:else if shown === "environment"}
      <div class="body"><EnvironmentPanel {stage} {bookId} /></div>
    {:else if shown === "library"}
      <div class="body"><LibraryPanel {bookId} nodeType={selectedNodeType} targetId={selection.target} onuse={useAsset} onusetarget={useAsTargetImage} onchanged={reloadContent} /></div>
    {:else if shown === "code"}
      <div class="body code"><CodePanel {bookId} {stage} /></div>
    {/if}
  </aside>
</div>

<style>
  .workspace { position: fixed; inset: var(--top-height) 0 0; display: grid; grid-template-columns: var(--tree-width) minmax(0, 1fr) var(--panel-width); background: var(--stage-background); }
  .workspace.tree-closed { --tree-width: auto; }
  .workspace.dragging { cursor: col-resize; user-select: none; }
  .tree { position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-right: 1px solid var(--line); color: var(--text); }
  .tree .bar { padding-left: .5rem; }
  .tree-closed .tree .bar { padding-left: .375rem; }
  .tree-body { padding: .25rem .375rem .75rem; }
  .grow { flex: 1; }
  .stage { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
  .tools { position: absolute; left: .5rem; top: .5rem; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: .125rem; max-width: calc(100% - 1rem); padding: .125rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  /* Three groups – gizmo, pick, shading – with a rule between; on a narrow stage a group wraps whole */
  .tool-group { flex: none; display: inline-flex; align-items: center; gap: .125rem; }
  .tool-group + .tool-group { margin-left: .125rem; padding-left: .25rem; border-left: 1px solid var(--line); }
  /* Blender's shading spheres sit shoulder to shoulder */
  .tools .shading { gap: 0; }
  /* A phone: ‹ › through the spreads at the stage's lower corners (#171) */
  .step { position: absolute; bottom: .5rem; z-index: 1; color: var(--text); }
  .step-previous { left: .5rem; }
  .step-next { right: .5rem; }
  /* A short stage (#177): toolbar and ‹ › share the top row; the toolbar stops before them and scrolls sideways */
  .steps-up .tools { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; max-width: calc(100% - 1.375rem - 2 * var(--control-height)); }
  .steps-up .step { top: calc(.5rem + .1875rem); bottom: auto; }
  .steps-up .step-previous { left: auto; right: calc(.625rem + var(--control-height)); }
  .menu-backdrop { position: fixed; inset: 0; z-index: 9; border: none; background: none; padding: 0; cursor: default; }
  .menu { position: fixed; z-index: 10; display: flex; flex-direction: column; min-width: 11rem; padding: .25rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .menu-head { padding: .25rem .625rem; }
  .menu-item { height: var(--control-height); padding: 0 .625rem; border: none; border-radius: var(--control-radius); background: none; color: inherit; text-align: left; cursor: pointer; white-space: nowrap; }
  @media (hover: hover) {
    .menu-item:hover { background: var(--hover-background); }
  }
  .menu-item.danger { color: var(--danger); }
  .picker { position: absolute; inset: 0; z-index: 2; cursor: crosshair; outline: none; touch-action: none; }
  .pick-chip { position: absolute; pointer-events: none; display: inline-flex; align-items: center; gap: .375rem; height: var(--control-height); padding: 0 .5rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: var(--text-small); font-family: ui-monospace, Consolas, monospace; }
  .pick-chip::before { content: ""; width: .875rem; height: .875rem; border-radius: 50%; border: 1px solid var(--line); background: var(--c); }
  .panel { position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-left: 1px solid var(--line); color: var(--text); }
  .bar { flex: none; display: flex; align-items: center; gap: .125rem; padding: .25rem .375rem; background: var(--surface-head); border-bottom: 1px solid var(--line); }
  .panel .bar { flex-wrap: wrap; }
  .head { flex: none; }
  .bar .tab { padding: 0 .375rem; }
  .bar .tab.on { background: var(--surface); }
  /* One line: the tabs as icons (#172); should it still not fit, the row scrolls instead of wrapping */
  .panel .bar.icons { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .bar .tab.icon-tab, .bar.icons .icon-button { padding: 0; width: var(--control-height); justify-content: center; flex: none; }
  /* A size container: the panels answer their own width (#159), narrow on a phone and when dragged small (#144) */
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; container: panel / inline-size; }
  .body.code { overflow: hidden; }
  .icon-button { text-decoration: none; }
  /* A column's edge: a strip over the border with a grip in its middle; the border shows while it is hovered or dragged */
  .edge { position: absolute; top: 0; bottom: 0; z-index: 3; width: .5rem; cursor: col-resize; touch-action: none; outline: none; }
  .edge-right { right: -.25rem; }
  .edge-left { left: -.25rem; }
  .edge::before { content: ""; position: absolute; top: 0; bottom: 0; left: calc(50% - 1px); width: 2px; background: var(--muted); opacity: 0; transition: opacity .1s; }
  .edge::after { content: ""; position: absolute; top: calc(50% - .75rem); left: calc(50% - 2px); width: 4px; height: 1.5rem; border-radius: 2px; background: var(--muted); opacity: .6; }
  .edge:focus-visible::before, .edge.on::before { opacity: 1; }
  .edge:focus-visible::after, .edge.on::after { opacity: 1; background: var(--text); }
  @media (hover: hover) {
    .edge:hover::before { opacity: 1; }
    .edge:hover::after { opacity: 1; background: var(--text); }
  }
  /* A finger catches a wider edge (mostly over the stage, so the panel's first button stays free) */
  @media (pointer: coarse) {
    .edge { width: 1.25rem; }
    .edge-right { right: -1rem; }
    .edge-left { left: -1rem; }
  }

  /* A phone: the stage fills the screen, the panel is a sheet at the bottom (closed = the bar only) */
  @media (max-width: 47.9rem) {
    .workspace { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .tree { display: none; }
    .workspace.sheet-dragging { cursor: row-resize; user-select: none; grid-template-rows: minmax(0, 1fr) var(--sheet-row); }
    /* Dragged, the sheet grows over the stage from its frozen row: the stage (a WebGL canvas) resizes once, on release */
    .workspace.sheet-dragging .panel { align-self: end; position: relative; z-index: 4; }
    .panel { height: var(--sheet-height, auto); border-left: none; border-top: 1px solid var(--line); }
    /* The grip and the tab row take the drag; the panel's own content still scrolls */
    .head { touch-action: none; background: var(--surface-head); }
    /* A finger-sized grip: a drag that starts just above the bar must not land on the stage (and orbit it) */
    .grip { position: relative; height: 1.5rem; cursor: row-resize; outline: none; }
    .grip::after { content: ""; position: absolute; top: calc(50% - 2px); left: calc(50% - 1.25rem); width: 2.5rem; height: 4px; border-radius: 2px; background: var(--muted); opacity: .6; }
    .grip:focus-visible::after, .grip.on::after { opacity: 1; background: var(--text); }
    @media (hover: hover) {
      .grip:hover::after { opacity: 1; background: var(--text); }
    }
    .body { padding-bottom: calc(.75rem + env(safe-area-inset-bottom)); }
    /* The head is the six tab icons alone (× ‹ › moved out – #171): they share the row, each at least the control
       height wide, so six of the touch height fit 360 px; the row scrolls rather than wraps */
    .bar .tab.icon-tab { flex: 1 1 0; width: auto; min-width: var(--control-height); }
    /* Closed, the tab row is the bottom of the screen: above the home indicator */
    .workspace.closed .panel .bar { padding-bottom: calc(.25rem + env(safe-area-inset-bottom)); }
  }
</style>
