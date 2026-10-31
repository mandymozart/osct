<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { content } from "#lib/content.svelte.js";
  import { Stage, type PickMode, type StagePick } from "#lib/stage/stage.svelte.js";
  import { GIZMO_KEYS, GIZMO_MODES, type GizmoMode } from "#lib/stage/gizmo.js";
  import { updatePreview, type ShadingMode } from "#lib/stage/preview.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import ToolGroup, { type ToolGroupOption } from "#lib/components/ToolGroup.svelte";
  import GridSnapMenu from "#lib/components/GridSnapMenu.svelte";
  import ViewMenu from "#lib/components/ViewMenu.svelte";
  import { expandedGroups, type GroupShape } from "#lib/tool-groups.js";
  import EntityPanel from "#lib/panels/EntityPanel.svelte";
  import TreePanel from "#lib/panels/TreePanel.svelte";
  import LibraryPanel from "#lib/panels/LibraryPanel.svelte";
  import CodePanel from "#lib/panels/CodePanel.svelte";
  import EnvironmentPanel from "#lib/panels/EnvironmentPanel.svelte";
  import { environmentEdit, stageEnvironment } from "#lib/environment.svelte.js";
  import NewTargetForm from "#lib/panels/NewTargetForm.svelte";
  import NewEntryForm from "#lib/panels/NewEntryForm.svelte";
  import NewSpreadForm from "#lib/NewSpreadForm.svelte";
  import { bookSource } from "#lib/book-source.svelte.js";
  import { entries } from "#lib/entries.svelte.js";
  import { deleteEntry, errorText, isMediaAsset, putTarget, type Asset, type MediaKind } from "#lib/api.js";
  import { removalStep, type RemovalStep } from "#lib/removal.js";
  import RemovalConfirm from "#lib/components/RemovalConfirm.svelte";
  import { library } from "#lib/library.svelte.js";
  import { nodeAt } from "#lib/values.js";
  import { selection } from "#lib/selection.svelte.js";
  import { firstTab as openingTab, type Tab } from "#lib/panel-tabs.js";
  import InfoView from "#lib/components/InfoView.svelte";
  import ContextMenu from "#lib/components/ContextMenu.svelte";
  import { clampSheet, clampWidth, LIMITS, maxWidth, SHEET_MAX, sheetFill, snapSheet, stepsOnTop, treeStartsOpen, widths, wordTabs, type Column } from "#lib/widths.svelte.js";
  import { readStored, writeStored } from "#lib/storage.js";

  /**
   * The workspace: the **tree** of the spread at the left (a 3D tool's outliner, collapsible to its bar), the stage
   * (the engine over the mock stage, its toolbar with the preview settings) and the panels **Inspector** (whatever is
   * selected – the spread while nothing else is, #229), **Environment**, **Library** and **Code** in a column at the
   * right (`panel-tabs.ts`). On a phone the panel is a sheet at the bottom whose head is the tab row (closed = the row
   * only) and the tree is its first tab. `?tab=environment` opens a tab (the book page links the Environment so). On a desktop the tree's right edge and
   * the panel's left edge are dragged to resize the columns (`widths`; the Code tab has its own, wider width), a
   * double-click on an edge restores the default; the stage's view follows its container. On a phone the sheet's head
   * (a grip and the tab row) is dragged up or down to any height and snaps when let go (#155); a double tap on the
   * grip restores the default height.
   */
  const bookId = $derived(page.params.book!);
  const spreadId = $derived(page.params.spread!);
  const TAB_KEY = "osct-editor-tab";
  /** The tab row: the word on a desktop, the icon on a phone */
  const TAB_BUTTONS: { tab: Tab; label: string; icon: IconName; title?: string }[] = [
    { tab: "tree", label: "Tree", icon: "tree" },
    { tab: "inspector", label: "Inspector", icon: "inspector", title: "Whatever is selected: the spread, an entry, a target, its entity or a node" },
    { tab: "environment", label: "Environment", icon: "globe", title: "The world around the reader and its sky, previewed on the stage" },
    { tab: "library", label: "Library", icon: "folder" },
    { tab: "code", label: "Code", icon: "code" },
  ];
  const TREE_KEY = "osct-editor-tree";
  const NARROW = "(max-width: 47.9rem)";
  const COARSE = "(pointer: coarse)";

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  /** `?tab=`, the stored tab (a Stage or Entity tab stored before #229 is the Inspector), the Inspector */
  const firstTab = openingTab(page.url.searchParams.get("tab"), readStored(TAB_KEY));
  let tab = $state<Tab | null>(firstTab);
  /** The tree column is open (desktop; stored – until then open in a wide window only, #172) */
  let treeOpen = $state(treeStartsOpen(window.innerWidth, readStored(TREE_KEY)));
  /** A phone: the tree is a tab of the sheet instead of a column; × ‹ › leave the sheet's head (#171) */
  let narrow = $state(false);
  /** A finger: every control is the touch height (app.css), so the tab row needs more room for its words */
  let coarse = $state(window.matchMedia(COARSE).matches);
  // The one selection of the tree, the stage and the Inspector – a target, its entity or a node (#162), the spread to start
  // with (#229) or what the header search asked for on this spread (#237); `reveal` counts the asks to show it
  let revealSeen = untrack(() => selection.reveal);
  untrack(() => selection.enter(spreadId));
  /** The draft or the stage could not be loaded: the stage area shows it with a retry instead of "Building the stage…" */
  let loadError = $state<string | null>(null);
  /** An action on the page failed (a removal, a target image, a reload after a change): shown over the stage until dismissed */
  let actionError = $state<string | null>(null);
  const failed = (e: unknown): void => {
    actionError = errorText(e);
  };

  /** The tab the sheet opens with when it is dragged open (the last one shown) */
  let lastTab: Tab = firstTab;
  const setTab = (next: Tab) => {
    tab = tab === next ? null : next;
    if (tab) lastTab = tab;
    writeStored(TAB_KEY, tab);
  };
  /** Show a tab (no toggle – a panel's link to another) */
  const openTab = (next: Tab) => {
    if (tab !== next) setTab(next);
  };
  const setTreeOpen = (open: boolean) => {
    treeOpen = open;
    writeStored(TREE_KEY, open ? "open" : "closed");
  };
  /** The tab the panel shows: on a desktop the tree has its own column, so a stored "tree" shows the Inspector */
  const shown = $derived<Tab | null>(tab === "tree" && !narrow ? "inspector" : tab);
  /** Something was selected (a row of the tree, a pick on the stage): the Inspector shows it – the spread too (#229) */
  const select = () => openTab("inspector");

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
  /** Dragged down, the sheet uncovers part of its row: the stage's bottom edge continued there, sampled once at the drag's start (#200) */
  let sheetBackground = $state<string | null>(null);
  const SHEET_FILL_SEGMENTS = 12;
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
      sheetBackground = null;
      void stage?.sampleBottom(SHEET_FILL_SEGMENTS).then(colours => { if (sheetDragging) sheetBackground = sheetFill(colours); });
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

  // ── targets and entries: the forms, removal, a changed image or placement ──
  let addingTarget = $state(false);
  /** The tree's "+ entry" (#237): an entry without a printed image on this spread */
  let addingEntry = $state(false);
  /** The creation step of a new spread (#238 – a digital-first book): the double page follows `after` */
  let addingSpread = $state<{ after: string | null } | null>(null);
  const openNewSpread = (after: string | null) => {
    addingTarget = false;
    addingEntry = false;
    addingSpread = { after };
    if (shown === null) setTab(lastTab);
  };
  const spreadCreated = async (newId: string) => {
    addingSpread = null;
    await reloadContent();
    void goto(resolve(`${bookId}/${newId}/`));
  };
  // Whether spreads are added here (#238): the book's source of truth, read once per book (the book's Inspector changes it)
  $effect(() => {
    const id = bookId;
    if (bookSource.bookId !== id) void bookSource.load(id);
  });
  /** + after the last spread's › (#238) */
  const atLastSpread = $derived(content.spreads.at(-1)?.id === spreadId);
  const canAddSpread = $derived(bookSource.bookId === bookId && bookSource.digital);
  let entityPanel = $state<{ useAsset: (kind: MediaKind, src: string, assetId: string) => void }>();
  /** The content changed under the stage (a target's image or placement, a relink): reload it and build the spread again */
  const reloadContent = async () => {
    try {
      await content.load(bookId);
      await stage?.refresh();
      void library.refresh();
    } catch (e) {
      failed(e);
    }
  };
  const targetCreated = async (targetId: string) => {
    addingTarget = false;
    await reloadContent();
    selection.selectTarget(targetId);
    openTab("inspector");
  };
  const entryCreated = async (entryId: string) => {
    addingEntry = false;
    await reloadContent();
    await entries.load(bookId);
    selection.selectEntry(entryId, null);
    openTab("inspector");
  };
  /** An entry's removal waiting for the person's confirmation in the panel, with the API's impact (#198) – no browser dialog */
  let removal = $state<{ targetId: string | null; entryId: string; step: RemovalStep } | null>(null);
  let removalBusy = $state(false);
  let removalError = $state<string | null>(null);
  const removed = async (targetId: string | null, entryId: string) => {
    removal = null;
    if ((targetId && selection.target === targetId) || selection.entry === entryId) selection.reset();
    await reloadContent();
  };
  /**
   * The tree's or the stage's "Remove target", the tree's "Remove entry" and Delete on an entry row (#227): first the
   * impact (409, the API removes nothing), shown in the panel
   */
  const removeEntry = async (entryId: string, targetId: string | null) => {
    removalError = null;
    try {
      await deleteEntry(bookId, entryId);
    } catch (e) {
      const step = removalStep(e);
      if (!step) return failed(e);
      addingTarget = false;
      removal = { targetId, entryId, step };
      if (shown === null) setTab(lastTab);
    }
  };
  /** The second step: the same removal with the confirmation id; a void id brings the fresh impact */
  const confirmRemoval = async (deleteFiles: boolean) => {
    if (!removal) return;
    const { targetId, entryId } = removal;
    removalBusy = true;
    removalError = null;
    try {
      await deleteEntry(bookId, entryId, removal.step.confirmation.id, deleteFiles);
      await removed(targetId, entryId);
    } catch (e) {
      const step = removalStep(e);
      if (step) removal = { targetId, entryId, step };
      else removalError = errorText(e);
    } finally {
      removalBusy = false;
    }
  };
  // ── the environment (#185): the book's replaces the HDRI as the stage's sky (rendered); previewed while its tab is open
  // (its Library picker included) – in every shading, the default's world too ──
  $effect(() => {
    void environmentEdit.load(bookId);
  });
  $effect(() => {
    const previewing = shown === "environment";
    const environment = previewing ? environmentEdit.edited : stageEnvironment.current;
    stage?.showEnvironment(environment ? $state.snapshot(environment) : null, previewing);
  });
  $effect(() => {
    if (shown !== "environment") environmentEdit.picking = null;
  });

  /** The library's Use: the selected node takes the file (the Inspector shows first – the Library tab replaced it) */
  const useAsset = async (asset: Asset) => {
    openTab("inspector");
    await tick();
    if (isMediaAsset(asset)) entityPanel?.useAsset(asset.kind, asset.url, asset.id);
  };
  const useAsTargetImage = async (asset: Asset) => {
    if (!selection.target) return;
    try {
      await putTarget(bookId, selection.target, { imageSrc: asset.url });
    } catch (e) {
      return failed(e);
    }
    await reloadContent();
  };
  const selectedNodeType = $derived.by(() => {
    const t = selection.target && !selection.onTarget ? stage?.treeOf(selection.target) : undefined;
    return t ? (nodeAt(t, selection.node) ?? t).type : null;
  });

  let disposed = false;
  /** Load the draft (unless it is loaded) and build the stage on it; a failure shows in the stage area with a retry */
  const start = async () => {
    loadError = null;
    try {
      if (content.bookId !== bookId) {
        const error = await content.load(bookId);
        if (error) {
          loadError = `${error.msg}${error.details?.[0] ? ` – ${error.details[0]}` : ""}`;
          return;
        }
      }
      if (disposed || !container) return;
      if (!stage) {
        stage = new Stage(container);
        // A click picks by the pick mode; nothing of its kind there clears the selection (tree, stage and panel alike)
        stage.onPick = hit => {
          stageMenu = null;
          if (!hit) {
            selection.clear();
            return;
          }
          selectHit(hit);
          select();
        };
        stage.onContextMenu = (hit, x, y) => {
          if (hit) selectHit(hit);
          stageMenu = { hit, x, y };
        };
      }
      await stage.open(spreadId);
    } catch (e) {
      loadError = errorText(e);
    }
  };

  onMount(() => {
    disposed = false;
    const media = window.matchMedia(NARROW);
    narrow = media.matches;
    const onMedia = (event: MediaQueryListEvent) => (narrow = event.matches);
    media.addEventListener("change", onMedia);
    const pointer = window.matchMedia(COARSE);
    const onPointer = (event: MediaQueryListEvent) => (coarse = event.matches);
    pointer.addEventListener("change", onPointer);
    void start();
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
    if (stage && stage.spreadId !== id) stage.open(id).catch(failed);
  });
  // …and the selection: another spread starts with itself selected (#229), not with a target it does not have
  let selectedOn = untrack(() => spreadId);
  $effect(() => {
    const id = spreadId;
    if (id === selectedOn) return;
    selectedOn = id;
    selection.enter(id);
  });
  // The search or the book crumb asked to show the selection: the Inspector opens (the sheet too, on a phone)
  $effect(() => {
    const asked = selection.reveal;
    if (asked === revealSeen) return;
    revealSeen = asked;
    untrack(() => {
      addingTarget = false;
      addingEntry = false;
      addingSpread = null;
      openTab("inspector");
    });
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
  // ── the stage toolbar (#180): three groups – transform, pick, shading – each one button with its active option's
  // icon and a menu, or its options side by side where the toolbar has room; then grid & snap (#190) and view (#229),
  // each always one button and its panel ──
  const GIZMO_NAMES: Record<GizmoMode, string> = { translate: "Move", rotate: "Rotate", scale: "Scale" };
  const GIZMO_ICONS: Record<GizmoMode, IconName> = { translate: "move", rotate: "rotate", scale: "scale" };
  /** W / E / R, from the gizmo's own keys */
  const gizmoKey = (mode: GizmoMode) => Object.entries(GIZMO_KEYS).find(([, m]) => m === mode)?.[0].toUpperCase();
  const TRANSFORM_OPTIONS: ToolGroupOption[] = GIZMO_MODES.map(mode => ({
    value: mode, name: GIZMO_NAMES[mode], key: gizmoKey(mode), icon: GIZMO_ICONS[mode], label: `${GIZMO_NAMES[mode]} (${gizmoKey(mode)}) – Shift or Ctrl turns snapping around`,
  }));
  const PICK_OPTIONS: ToolGroupOption[] = [
    { value: "entity", name: "Entities", icon: "package", label: "Select entities – a click picks the entity (its root)" },
    { value: "node", name: "Nodes", icon: "node", label: "Select nodes – a click picks the node under the pointer" },
    { value: "target", name: "Targets", icon: "target", label: "Select targets – a click picks the printed target" },
  ] satisfies (ToolGroupOption & { value: PickMode })[];
  const SHADING_OPTIONS: ToolGroupOption[] = [
    { value: "wireframe", name: "Wire", icon: "shade-wire", label: "Wireframe – the entities as lines" },
    { value: "solid", name: "Solid", icon: "shade-solid", label: "Solid – one grey, the scene's lights" },
    { value: "textured", name: "Textured", icon: "shade-textured", label: "Textured – the content's materials, no sky" },
    { value: "rendered", name: "Rendered", icon: "shade-rendered", label: "Rendered – the HDRI's sky and light" },
  ] satisfies (ToolGroupOption & { value: ShadingMode })[];
  /** With the book's environment, *rendered* shows its world instead of the HDRI (#185) – the button's label says so */
  const shadingOptions = $derived<ToolGroupOption[]>(stageEnvironment.current
    ? SHADING_OPTIONS.map(option => (option.value === "rendered" ? { ...option, label: "Rendered – the environment's world as sky, the reader's light" } : option))
    : SHADING_OPTIONS);
  /** The groups' shapes in the toolbar's order (the shading spheres sit shoulder to shoulder; grid & snap and view are one button each) */
  const TOOL_SHAPES: GroupShape[] = [{ options: TRANSFORM_OPTIONS.length }, { options: PICK_OPTIONS.length }, { options: SHADING_OPTIONS.length, tight: true }, { options: 1 }, { options: 1 }];
  /** The view group: the stage's menu opens it (*View settings…*) */
  let viewMenu = $state<{ open: () => void }>();

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
    // A target with AR content adds to its entity: the root is selected (the Inspector's "+ node" shows)
    const id = selection.target;
    if (id && selection.onTarget && stage?.treeOf(id)) selection.selectNode(id, []);
    openTab("inspector");
    requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('select[aria-label="New node type"]')?.focus());
  };
  const menuPlacement = () => {
    stageMenu = null;
    // The placement is the target's: its level opens
    if (selection.target) selection.selectTarget(selection.target);
    openTab("inspector");
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("button.placement-toggle")?.click());
  };
  const NAVIGATION_HELP = "Drag = orbit · Shift-drag, the middle button or two fingers = pan · wheel / pinch = distance · double tap = the reader's view · ← → = the spreads. A click picks what lies there, right click opens its menu.";

  const spread = $derived(content.spread(spreadId));

  // ── the toolbar's room (#180) and the phone's ‹ › (#171, #177): the groups stay expanded as far as the toolbar's
  // room allows – the stage's width less its margins and, on a phone, less ‹ › (they may share the top row) – so the
  // toolbar is always one row. ‹ › sit at the stage's lower corners; on a stage too short for them below the toolbar
  // (the sheet almost full) they move to its top right, beside it ──
  let tools = $state<HTMLDivElement>();
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let stepsUp = $state(false);
  let expanded = $state<boolean[]>(TOOL_SHAPES.map(() => false));
  /** Slack (px) against rounding: a toolbar that only just fits would wrap on a subpixel */
  const ROOM_SLACK = 4;
  $effect(() => {
    const [bar, width, height] = [tools, stageWidth, stageHeight];
    void coarse;
    if (!bar || !width) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // The control height (a rem token, 44 px with a finger – #171)
    const token = getComputedStyle(bar).getPropertyValue("--control-height").trim();
    const button = token.endsWith("rem") ? parseFloat(token) * rem : parseFloat(token) || 1.75 * rem;
    // The toolbar's CSS below: gap .125rem, a rule of .125rem margin + .25rem padding + 1px, padding .125rem and a 1px border
    const metrics = { button, gap: rem / 8, rule: (3 * rem) / 8 + 1, chrome: rem / 4 + 2 };
    // The toolbar's max-width: the stage's less 1rem; on a phone also less ‹ › (2 buttons and their margins)
    const room = width - rem - (narrow ? 2 * button + (3 * rem) / 8 : 0) - ROOM_SLACK;
    const next = expandedGroups(TOOL_SHAPES, room, metrics);
    if (next.some((e, i) => e !== expanded[i])) expanded = next;
    stepsUp = narrow && !!height && stepsOnTop(height, bar.offsetHeight, button, rem / 2);
  });

  const step = (direction: 1 | -1) => {
    const next = content.neighbour(spreadId, direction);
    if (next) void goto(resolve(`${bookId}/${next.id}/`), { replace: true });
  };
  /** Shift or Ctrl held turns snapping around while dragging (#190) */
  const snapKey = (event: KeyboardEvent) => stage?.setSnapModifier(event.shiftKey || event.ctrlKey);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Shift" || event.key === "Control") snapKey(event);
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
    const mode = GIZMO_KEYS[event.key.toLowerCase()];
    if (mode && !event.ctrlKey && !event.metaKey && !event.altKey) stage?.setGizmoMode(mode);
    // Delete removes the selected node (the tree does the same when it has the focus and stops the event)
    if ((event.key === "Delete" || event.key === "Backspace") && removeSelectedNode()) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === "Shift" || event.key === "Control") snapKey(event);
  };

  // ── Pick a colour from the stage (the colour field's eyedropper): an overlay over the stage shows the colour under
  // the pointer in a chip; a tap takes it, Esc cancels. The overlay is app UI (role dialog), so the tracker ignores it.
  let picking = $state<((hex: string | null) => void) | null>(null);
  let pickHex = $state<string | null>(null);
  let pickAt = $state({ x: 0, y: 0 });
  let pickSample = 0;
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
    const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pickAt = at;
    // The frame reads the pixel; only the latest move's answer is shown
    const sample = ++pickSample;
    void stage.sampleColor(at.x, at.y).then(hex => { if (picking && sample === pickSample) pickHex = hex; });
  };
</script>

<svelte:window bind:innerWidth={viewport} bind:innerHeight={screenHeight} onkeydown={onKey} onkeyup={onKeyUp} onblur={() => stage?.setSnapModifier(false)} />

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
  style:--sheet-height={narrow && shown !== null ? `${sheetHeight}px` : undefined} style:--sheet-row={sheetDragging ? `${sheetRow}px` : undefined}
  style:--sheet-fill={sheetDragging ? sheetBackground ?? undefined : undefined}>
  <aside class="tree" data-app-ui>
    <div class="bar">
      {#if treeOpen}<span class="section-label grow">tree</span>{/if}
      <button type="button" class="icon-button" onclick={() => setTreeOpen(!treeOpen)} title={treeOpen ? "Hide the tree" : "Show the tree"} aria-label={treeOpen ? "Hide the tree" : "Show the tree"} aria-expanded={treeOpen}>
        <Icon name={treeOpen ? "previous" : "next"} />
      </button>
    </div>
    {#if treeOpen}
      <div class="body tree-body"><TreePanel {stage} {spreadId} onselect={select} onaddtarget={() => { addingEntry = false; addingTarget = true; }}
        onaddentry={() => { addingTarget = false; addingSpread = null; addingEntry = true; if (shown === null) setTab(lastTab); }}
        onaddspread={canAddSpread ? openNewSpread : undefined} onremoveentry={removeEntry} /></div>
      <InfoView />
      {#if treeShown}{@render edge("tree", "Tree edge")}{/if}
    {/if}
  </aside>

  <div class="stage" class:steps-up={narrow && stepsUp} bind:this={container} bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}
    data-help-name="Stage" data-help={NAVIGATION_HELP}>
    {#if stage && stage.status === "running"}
      <!-- Three groups, each one button and its menu or – where the toolbar has room – its options side by side, then
           grid & snap and view, one button and its panel each; always one row (#180, #190, #229) -->
      <div class="tools" role="toolbar" data-app-ui aria-label="Stage tools" bind:this={tools}>
        <ToolGroup label="Transform" options={TRANSFORM_OPTIONS} value={stage.gizmoMode} expanded={expanded[0]}
          onchoose={mode => stage?.setGizmoMode(mode as GizmoMode)} />
        <ToolGroup label="Pick" options={PICK_OPTIONS} value={stage.pickMode} expanded={expanded[1]}
          onchoose={mode => stage?.setPickMode(mode as PickMode)} />
        <ToolGroup label="Shading" options={shadingOptions} value={stage.shading} expanded={expanded[2]} tight stroke={1.75}
          onchoose={mode => updatePreview({ shading: mode as ShadingMode })} />
        <GridSnapMenu />
        <ViewMenu bind:this={viewMenu} format={spread?.format ?? "spread"} />
      </div>
      {#if narrow}
        <!-- A phone: ‹ › through the spreads at the stage's lower corners, out of the sheet's head (#171); on a short
             stage at its top right, beside the toolbar (#177) -->
        <button type="button" class="icon-button framed step step-previous" data-app-ui onclick={() => step(-1)}
          title="Previous spread" aria-label="Previous spread"><Icon name="previous" /></button>
        <button type="button" class="icon-button framed step step-next" data-app-ui onclick={() => step(1)}
          title="Next spread" aria-label="Next spread"><Icon name="next" /></button>
        {#if canAddSpread && atLastSpread && !stepsUp}
          <button type="button" class="icon-button framed step step-add" data-app-ui onclick={() => openNewSpread(spreadId)}
            title="Add a spread after the last one" aria-label="Add a spread"><Icon name="plus" /></button>
        {/if}
      {/if}
      {#if stageMenu?.hit}
        {@const hit = stageMenu.hit}
        {@const hasTree = !!stage.treeOf(hit.targetId)}
        <ContextMenu at={stageMenu} label="Target" head="{hit.targetId}{hit.path.length ? ` › ${hit.path.join(' › ')}` : ''}" onclose={() => (stageMenu = null)} items={[
          { label: hasTree ? "Add node…" : "Add AR content…", select: menuAddNode },
          ...(hasTree ? [{ label: hit.path.length ? "Remove node" : "Remove entity", select: menuRemoveNode }] : []),
          { label: "Placement on the page…", select: menuPlacement },
          { label: "Replay the first find", select: () => stage?.replayUnlock() },
          { label: "Library…", select: () => setTab("library") },
          { label: "Remove target", danger: true, select: () => { const t = content.spread(spreadId)?.targets.find(x => x.id === hit.targetId); if (t) void removeEntry(t.entryId, t.id); } },
        ]} />
      {:else if stageMenu}
        <ContextMenu at={stageMenu} label="Stage" head={spread?.title ?? spreadId} onclose={() => (stageMenu = null)} items={[
          { label: "+ target…", select: () => (addingTarget = true) },
          { label: "Replay the first find", select: () => stage?.replayUnlock() },
          { label: "View settings…", select: () => viewMenu?.open() },
        ]} />
      {/if}
    {/if}
    {#if loadError}
      <p class="notice danger" role="alert">{loadError} <button type="button" class="pill framed" onclick={() => void start()}>Retry</button></p>
    {:else if actionError}
      <p class="notice danger" role="alert">{actionError} <button type="button" class="pill framed" onclick={() => (actionError = null)}>Dismiss</button></p>
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
        {#if canAddSpread && atLastSpread}
          <button type="button" class="icon-button" onclick={() => openNewSpread(spreadId)} title="Add a spread after the last one" aria-label="Add a spread"
            data-help-name="Add a spread" data-help="Opens the creation step for a new spread – a double page after this one, or a cover the book does not have yet."><Icon name="plus" /></button>
        {/if}
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
    {#if removal}
      <div class="body removal"><RemovalConfirm step={removal.step} busy={removalBusy} error={removalError} onconfirm={deleteFiles => void confirmRemoval(deleteFiles)} oncancel={() => (removal = null)} /></div>
    {:else if addingTarget && spread}
      <div class="body"><NewTargetForm {bookId} {spread} {stage} oncreated={targetCreated} oncancel={() => (addingTarget = false)} /></div>
    {:else if addingSpread}
      <div class="body"><NewSpreadForm {bookId} spreads={content.spreads} after={addingSpread.after} oncreated={spreadCreated} oncancel={() => (addingSpread = null)} /></div>
    {:else if addingEntry && spread}
      <div class="body"><NewEntryForm {bookId} {spread} oncreated={entryCreated} oncancel={() => (addingEntry = false)} /></div>
    {:else if shown === "tree"}
      <div class="body"><TreePanel {stage} {spreadId} onselect={select} onaddtarget={() => { addingEntry = false; addingTarget = true; }}
        onaddentry={() => { addingTarget = false; addingSpread = null; addingEntry = true; }} onaddspread={canAddSpread ? openNewSpread : undefined} onremoveentry={removeEntry} /></div>
    {:else if shown === "inspector"}
      <div class="body"><EntityPanel bind:this={entityPanel} {stage} {bookId} {spreadId} selected={selection.target} bind:node={selection.node} {pickColour} ontargetchanged={reloadContent} oncode={() => openTab("code")} onenvironment={() => openTab("environment")} /></div>
    {:else if shown === "environment"}
      <div class="body"><EnvironmentPanel {stage} {bookId} /></div>
    {:else if shown === "library"}
      <div class="body"><LibraryPanel {bookId} nodeType={selectedNodeType} targetId={selection.target} onuse={useAsset} onusetarget={useAsTargetImage} onchanged={reloadContent} onopencode={() => openTab("code")} /></div>
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
  /* The stage frame (#234) under the toolbar and the notices; a column or sheet drag over it stays the page's */
  .stage :global(iframe.stage-frame) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; }
  .workspace.dragging .stage :global(iframe.stage-frame), .workspace.sheet-dragging .stage :global(iframe.stage-frame) { pointer-events: none; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
  /* Above ‹ › so a group's menu covers them; the page computes the groups' widths from these sizes */
  .tools { position: absolute; left: .5rem; top: .5rem; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: .125rem; max-width: calc(100% - 1rem); padding: .125rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .tools :global(.tool-group + .tool-group) { margin-left: .125rem; padding-left: .25rem; border-left: 1px solid var(--line); }
  .step { position: absolute; bottom: .5rem; z-index: 1; color: var(--text); }
  .step-previous { left: .5rem; }
  .step-next { right: .5rem; }
  .step-add { right: calc(.875rem + var(--control-height)); }
  .steps-up .tools { max-width: calc(100% - 1.375rem - 2 * var(--control-height)); }
  .steps-up .step { top: calc(.5rem + .1875rem); bottom: auto; }
  .steps-up .step-previous { left: auto; right: calc(.625rem + var(--control-height)); }
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
  .panel .bar.icons { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .bar .tab.icon-tab, .bar.icons .icon-button { padding: 0; width: var(--control-height); justify-content: center; flex: none; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; container: panel / inline-size; }
  .body.code { overflow: hidden; }
  .icon-button { text-decoration: none; }
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
  /* A finger gets a wider edge, mostly over the stage, so the panel's first button stays free */
  @media (pointer: coarse) {
    .edge { width: 1.25rem; }
    .edge-right { right: -1rem; }
    .edge-left { left: -1rem; }
  }

  @media (max-width: 47.9rem) {
    .workspace { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
    .tree { display: none; }
    .workspace.sheet-dragging { cursor: row-resize; user-select: none; grid-template-rows: minmax(0, 1fr) var(--sheet-row); background: var(--sheet-fill, var(--stage-background)); }
    /* The stage (a WebGL canvas) resizes once, on release – not while the sheet is dragged */
    .workspace.sheet-dragging .panel { align-self: end; position: relative; z-index: 4; }
    .panel { height: var(--sheet-height, auto); border-left: none; border-top: 1px solid var(--line); }
    /* The grip and the tab row take the drag; the panel's content still scrolls */
    .head { touch-action: none; background: var(--surface-head); }
    /* A drag that starts just above the bar must not land on the stage and orbit it */
    .grip { position: relative; height: 1.5rem; cursor: row-resize; outline: none; }
    .grip::after { content: ""; position: absolute; top: calc(50% - 2px); left: calc(50% - 1.25rem); width: 2.5rem; height: 4px; border-radius: 2px; background: var(--muted); opacity: .6; }
    .grip:focus-visible::after, .grip.on::after { opacity: 1; background: var(--text); }
    @media (hover: hover) {
      .grip:hover::after { opacity: 1; background: var(--text); }
    }
    .body { padding-bottom: calc(.75rem + env(safe-area-inset-bottom)); }
    /* Five tabs of the touch height fit 360 px: the row scrolls rather than wraps */
    .bar .tab.icon-tab { flex: 1 1 0; width: auto; min-width: var(--control-height); }
    .workspace.closed .panel .bar { padding-bottom: calc(.25rem + env(safe-area-inset-bottom)); }
  }
</style>
