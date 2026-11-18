<script lang="ts">
  import { writeStoredJson } from "#lib/storage.js";
  import { onMount, tick, untrack } from "svelte";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { content } from "#lib/content.svelte.js";
  import { Stage, type StagePick } from "#lib/stage/stage.svelte.js";
  import { PICK_KINDS, toggleKind, type PickKind } from "#lib/stage/pick.js";
  import { STAGE_TOOLS, TOOL_KEYS, type StageTool } from "#lib/stage/gizmo.js";
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
  import { pageImages } from "#lib/page-images.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { nodeAt } from "#lib/values.js";
  import { queueTreeSaves } from "#lib/tree-autosave.js";
  import type { EntityData } from "@engine/types";
  import { selection } from "#lib/selection.svelte.js";
  import { firstTab as openingTab, type Tab } from "#lib/panel-tabs.js";
  import InfoView from "#lib/components/InfoView.svelte";
  import ContextMenu from "#lib/components/ContextMenu.svelte";
  import { wordTabs } from "#lib/panel-tabs.js";
  import { readStored, writeStored } from "#lib/storage.js";
  import ScenesPanel from "#lib/ScenesPanel.svelte";
  import { scenes } from "#lib/scenes.svelte.js";
  import { fetchBookLayout } from "#lib/sheet-preview.js";
  import type { StageLayout } from "#lib/stage/stage-layout.js";
  import FloatingPanel from "#lib/components/FloatingPanel.svelte";
  import { Floats, openFloats } from "#lib/components/floats.svelte.js";
  import { at, type PanelSpec } from "#lib/components/floats.js";

  /**
   * The workspace. On a desktop and an iPad (#308) the **stage** (the engine over the mock stage) is the whole window
   * and the panels float over it (`FloatingPanel`, `SCENE_PANELS`): the **Tree** of the spread (a 3D tool's outliner),
   * the **Inspector** (essential) with its tabs Inspector (whatever is selected – the spread while nothing else is,
   * #229), Environment, Library and Code (`panel-tabs.ts`), the **Scenes** filmstrip (#307, `ScenesPanel.svelte`: a
   * card opens its scene, a band selects its group, a drag reorders; the draft follows `scenes.version`), **Info** and
   * the stage's **Tools** (inline). Each moves by its head, resizes by its edges, folds to its head and – unless
   * essential – closes; the top bar's panels menu reopens them and resets the layout, which is remembered per workspace
   * in this browser. The editor is desktop and iPad only (Tilman, 2026-11-18): the phone's layout – a sheet at the
   * bottom with the tree as a tab, ‹ › over the stage – is gone (#317). `?tab=environment` opens a tab.
   */
  const bookId = $derived(page.params.book!);
  const spreadId = $derived(page.params.spread!);
  const TAB_KEY = "osct-editor-tab";
  /** The Inspector's tab row: the words, or the icons in an Inspector too narrow for them */
  const TAB_BUTTONS: { tab: Tab; label: string; icon: IconName; title?: string }[] = [
    { tab: "inspector", label: "Inspector", icon: "inspector", title: "Whatever is selected: the spread, an entry, a target, its entity or a node" },
    { tab: "environment", label: "Environment", icon: "globe", title: "The sky around the reader and the onion sky, previewed on the stage" },
    { tab: "library", label: "Library", icon: "folder" },
    { tab: "code", label: "Code", icon: "code" },
  ];
  const COARSE = "(pointer: coarse)";

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  /** `?tab=`, the stored tab (a Stage or Entity tab stored before #229 is the Inspector), the Inspector */
  const firstTab = openingTab(page.url.searchParams.get("tab"), readStored(TAB_KEY));
  let tab = $state<Tab | null>(firstTab);
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

  const setTab = (next: Tab) => {
    tab = tab === next ? null : next;
    writeStored(TAB_KEY, tab);
  };
  /** Show a tab (no toggle – a panel's link to another) */
  const openTab = (next: Tab) => {
    if (tab !== next) setTab(next);
  };
  /** The tab the Inspector shows: always one (the tree is a panel of its own – a stored "tree" is the Inspector) */
  const shown = $derived<Tab>(tab === "tree" || tab === null ? "inspector" : tab);
  /** Something was selected (a row of the tree, a pick on the stage): the Inspector shows it – the spread too (#229) */
  const select = () => openTab("inspector");
  /** A tab of the Inspector panel chosen: it shows that tab */
  const chooseTab = (next: Tab) => openTab(next);

  // ── the floating panels (#308, desktop and iPad): the stage is the whole window, the panels float over it ──
  /**
   * The scene workspace's panels (rem). The order is the order of growth: an earlier one leaves a later one the room it
   * asks for – the Tree and the Inspector (they scroll) grow to the full height beside the Scenes strip.
   */
  const SCENE_PANELS: PanelSpec[] = [
    { id: "tree", name: "Tree", icon: "tree", about: "The spread's entries, their targets and the entities' nodes: a click selects, a drag moves a node.",
      place: at("top-left", 0, 0), size: { w: 16.5, h: "fill" }, min: { w: 12, h: 8 } },
    { id: "inspector", name: "Inspector", icon: "inspector", about: "Whatever is selected, and the tabs Environment, Library and Code. It folds but never closes.",
      place: at("top-right", 0, 0), size: { w: 25, h: "fill" }, min: { w: 16, h: 10 }, essential: true },
    { id: "scenes", name: "Scenes", icon: "film", about: "The experience's scenes as a filmstrip: a card opens its scene, a band selects its group, a drag reorders.",
      place: at("bottom-left", 17, 0), size: { w: "fill", h: 12 }, min: { w: 20, h: 10 } },
    { id: "info", name: "Info", icon: "info", about: "The name and description of the control under the pointer or in focus.",
      place: at("bottom-left", 0, 0, { collapsed: true }), size: { w: 16.5, h: 10 }, min: { w: 12, h: 5 } },
    { id: "tools", name: "Tools", icon: "tool", about: "The stage's tools: select and its filters, move / rotate / scale, render quality, grid & snap, view and live.",
      place: at("top-left", 17, 0), size: { w: "content", h: "content" }, min: { w: 12, h: 2 }, essential: true, inline: true },
  ];
  const floats = new Floats("scene", SCENE_PANELS);
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  // The room and the measures from the page's CSS: the control height (44 px with a finger), the gap of .5rem
  $effect(() => {
    const [el, w, h] = [workspace, workspaceWidth, workspaceHeight];
    void coarse;
    if (!el || !w || !h) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const token = getComputedStyle(el).getPropertyValue("--control-height").trim();
    const control = token.endsWith("rem") ? parseFloat(token) * rem : parseFloat(token) || 1.75 * rem;
    const gap = rem / 2;
    floats.metrics = { rem, gap, head: control + (3 * rem) / 8 + 1, button: control, char: rem / 2 };
    floats.area = { x: gap, y: gap, w: Math.max(1, w - 2 * gap), h: Math.max(1, h - 2 * gap) };
  });
  // The Code tab asks for its wider Inspector (36rem) – until the person resizes the panel
  $effect(() => {
    floats.asks = shown === "code" ? { inspector: { w: 36, h: "fill" } } : {};
  });
  // The top bar's panels menu lists this workspace's panels
  $effect(() => {
    openFloats.current = floats;
    return () => {
      if (openFloats.current === floats) openFloats.current = null;
    };
  });
  /** A form or a removal step opens in the Inspector: a folded Inspector opens for it */
  $effect(() => {
    if ((removal || addingTarget || addingEntry || addingSpread)) untrack(() => { if (floats.collapsed("inspector")) floats.setCollapsed("inspector", false); });
  });

  let workspace = $state<HTMLDivElement>();
  /** The tabs as icons in an Inspector too narrow for the words, so its head stays one line (#172) */
  const iconTabs = $derived(!wordTabs(floats.views.inspector?.rect.w ?? 0, coarse));


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
      // The Scenes panel's counts (targets per scene)
      void scenes.load(bookId);
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
  // An environment edit reached the draft: the content follows (nothing is built again – the stage shows the values
  // already), the Library counts the files' uses
  environmentEdit.onsaved = async id => {
    await content.load(id);
    void library.refresh();
  };
  $effect(() => {
    const previewing = shown === "environment";
    const environment = previewing ? environmentEdit.edited : stageEnvironment.current;
    stage?.showEnvironment(environment ? $state.snapshot(environment) : null, previewing);
  });
  $effect(() => {
    if (shown !== "environment") environmentEdit.picking = null;
  });
  // ── page images (#251): the book's own images of single pages lie over the layout's sheet on the stage ──
  $effect(() => {
    if (pageImages.bookId !== bookId) void pageImages.load(bookId);
  });
  $effect(() => {
    const images = pageImages.bookId === bookId ? pageImages.byKey : {};
    stage?.setPageImages(images);
  });

  // ── the Scenes panel (#307): the strip's pictures are the book page's (the layout's sheets, the page images); a change
  // of the order, a group or a new scene reaches the draft, so ‹ › and the stage follow ──
  let sheetLayout = $state<StageLayout | null>(null);
  $effect(() => {
    const base = content.bookId === bookId ? content.assetsBase : null;
    if (base === null) return;
    let live = true;
    void fetchBookLayout(base).then(layout => { if (live) sheetLayout = layout; });
    return () => { live = false; };
  });
  let scenesSeen = untrack(() => scenes.version);
  $effect(() => {
    const version = scenes.version;
    if (version === scenesSeen) return;
    scenesSeen = version;
    untrack(() => void content.load(bookId).catch(failed));
  });
  /** A card opens its scene; a scene just made is in the draft first */
  // The experience's address opens the scene last open here (the overview page is gone – Tilman, 2026-11-18)
  $effect(() => writeStoredJson(`osct-editor-last-scene:${bookId}`, spreadId));
  const openScene = async (id: string) => {
    if (id === spreadId) return;
    try {
      if (!content.spread(id)) await content.load(bookId);
    } catch (e) {
      return failed(e);
    }
    void goto(resolve(`${bookId}/${id}/`));
  };
  const selectGroup = (id: string) => {
    selection.selectGroup(id);
    openTab("inspector");
  };

  // ── autosave (#259): a target's live tree is an edit the draft does not hold yet – the Inspector's rows, a file for
  // a node, the tree's moves, a gizmo drag – and is saved by itself, whichever panel is open ──
  let queuedTrees: { stage: Stage; trees: Map<string, EntityData> } | null = null;
  $effect(() => {
    const s = stage;
    const book = bookId;
    if (!s) return;
    // Every change of the live trees runs this again
    void [...s.overrides];
    untrack(() => {
      if (queuedTrees?.stage !== s) queuedTrees = { stage: s, trees: new Map() };
      queueTreeSaves(s, book, queuedTrees.trees);
    });
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
        // The Code tab's saved sources run on every frame that starts (#269): their looks and components are known at once
        const started = stage;
        started.onStarted = () => void plugins.autoLoad(bookId, started);
      }
      await stage.open(spreadId);
    } catch (e) {
      loadError = errorText(e);
    }
  };

  onMount(() => {
    disposed = false;
    const pointer = window.matchMedia(COARSE);
    const onPointer = (event: MediaQueryListEvent) => (coarse = event.matches);
    pointer.addEventListener("change", onPointer);
    void start();
    return () => {
      disposed = true;
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
  // The search or the book's ⚙ asked to show the selection: the Inspector opens
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
  // ── the stage toolbar (#180, #308): the tool in hand – select or a gizmo mode –, the select filters and render quality,
  // each one button with its active option's icon and a menu, or its options side by side where the toolbar has room
  // (render quality always its menu); then grid & snap (#190) and view (#229), each always one button and its panel ──
  const TOOL_NAMES: Record<StageTool, string> = { select: "Select", translate: "Move", rotate: "Rotate", scale: "Scale" };
  const TOOL_ICONS: Record<StageTool, IconName> = { select: "pointer", translate: "move", rotate: "rotate", scale: "scale" };
  /** Q / W / E / R, from the tools' own keys */
  const toolKey = (tool: StageTool) => Object.entries(TOOL_KEYS).find(([, t]) => t === tool)?.[0].toUpperCase();
  const TOOL_OPTIONS: ToolGroupOption[] = STAGE_TOOLS.map(tool => ({
    value: tool, name: TOOL_NAMES[tool], key: toolKey(tool), icon: TOOL_ICONS[tool],
    label: tool === "select" ? `Select (${toolKey(tool)}) – a click picks what the filters allow, no gizmo` : `${TOOL_NAMES[tool]} (${toolKey(tool)}) – Shift or Ctrl turns snapping around`,
  }));
  /** The select filters, in this order (Tilman, #308): each says what a click may pick; none on = anything */
  const FILTER_TEXTS: Record<PickKind, { name: string; icon: IconName; label: string }> = {
    entity: { name: "Entities", icon: "package", label: "Entities – a click may pick an entity (its root)" },
    target: { name: "Targets", icon: "target", label: "Targets – a click may pick a printed target" },
    model: { name: "Models", icon: "model", label: "Models – a click may pick the model under the pointer (the model a part belongs to)" },
    node: { name: "Nodes", icon: "node", label: "Nodes – a click may pick the node under the pointer, as deep as the tree goes" },
  };
  const FILTER_OPTIONS: ToolGroupOption[] = PICK_KINDS.map(kind => ({ value: kind, ...FILTER_TEXTS[kind] }));
  const FILTER_HELP = "What a click on the stage may pick, for every tool: entities, targets, models, nodes – each a toggle. With none on a click picks anything (the node under the pointer, or the print). With several on, the nearest thing any of them takes, at the finest level that is on.";
  const SHADING_OPTIONS: ToolGroupOption[] = [
    { value: "wireframe", name: "Wire", icon: "shade-wire", label: "Wireframe – the entities as lines" },
    { value: "solid", name: "Solid", icon: "shade-solid", label: "Solid – one grey, the scene's lights" },
    { value: "textured", name: "Textured", icon: "shade-textured", label: "Textured – the content's materials, no sky" },
    { value: "rendered", name: "Rendered", icon: "shade-rendered", label: "Rendered – the HDRI's sky and light" },
  ] satisfies (ToolGroupOption & { value: ShadingMode })[];
  /** With the book's environment, *rendered* shows its world instead of the HDRI (#185) – the button's label says so */
  const shadingOptions = $derived<ToolGroupOption[]>(stageEnvironment.current
    ? SHADING_OPTIONS.map(option => (option.value === "rendered" ? { ...option, label: "Rendered – the environment's sky, the reader's light" } : option))
    : SHADING_OPTIONS);
  /** The groups' shapes in the toolbar's order (render quality, grid & snap and view are one button each) */
  const TOOL_SHAPES: GroupShape[] = [{ options: TOOL_OPTIONS.length }, { options: FILTER_OPTIONS.length }, { options: 1 }, { options: 1 }, { options: 1 }];
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

  // ── the toolbar's room (#180): the groups stay expanded as far as the Tools panel's room allows, so the toolbar is
  // always one row (as a column, #315, every group is one button) ──
  let tools = $state<HTMLDivElement>();
  let expanded = $state<boolean[]>(TOOL_SHAPES.map(() => false));
  /** Slack (px) against rounding: a toolbar that only just fits would wrap on a subpixel */
  const ROOM_SLACK = 4;
  $effect(() => {
    const bar = tools;
    void coarse;
    if (!bar) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // The control height (a rem token, 44 px with a finger – #171)
    const token = getComputedStyle(bar).getPropertyValue("--control-height").trim();
    const button = token.endsWith("rem") ? parseFloat(token) * rem : parseFloat(token) || 1.75 * rem;
    // The toolbar's CSS below: gap .125rem, a rule of .125rem margin + .25rem padding + 1px, padding .125rem and a 1px border
    const metrics = { button, gap: rem / 8, rule: (3 * rem) / 8 + 1, chrome: rem / 4 + 2 };
    // The Tools panel's room: the width it was resized to, else the room between the Tree and the Inspector
    const room = floatingRoom(rem) - ROOM_SLACK;
    // A column (#315): every group one button and its menu – side by side its options would make it wide
    const next = floats.vertical("tools") ? TOOL_SHAPES.map(() => false) : expandedGroups(TOOL_SHAPES, room, metrics);
    if (next.some((e, i) => e !== expanded[i])) expanded = next;
  });

  /** The floating toolbar's room for its groups (px): its resized width, else between the Tree and the Inspector */
  const floatingRoom = (rem: number) => {
    const m = floats.metrics;
    const chrome = m.head + m.button + m.gap + rem / 2;
    const resized = floats.places.tools?.size?.w;
    if (resized) return resized - chrome;
    const views = floats.views;
    return floats.area.w - (views.tree?.rect.w ?? 0) - (views.inspector?.rect.w ?? 0) - 4 * m.gap - chrome;
  };

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
    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (tool && !event.ctrlKey && !event.metaKey && !event.altKey) stage?.setTool(tool);
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

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} onblur={() => stage?.setSnapModifier(false)} />


{#snippet toolbar()}
  {#if stage}
    <!-- The tool in hand and the select filters, render quality, then grid & snap and view, one button and its panel each;
         always one row (#180, #190, #229, #308) -->
    <div class="tools" class:vertical={floats.vertical("tools")} role="toolbar" aria-orientation={floats.vertical("tools") ? "vertical" : "horizontal"}
      data-app-ui aria-label="Stage tools" bind:this={tools}>
      <ToolGroup label="Tool" options={TOOL_OPTIONS} value={stage.tool} expanded={expanded[0]}
        onchoose={tool => stage?.setTool(tool as StageTool)} />
      <span class="tool-group filters" data-help-name="Select filters" data-help={FILTER_HELP}>
        <ToolGroup label="Select filters" options={FILTER_OPTIONS} selected={stage.pickFilter} icon="pointer" expanded={expanded[1]}
          onchoose={kind => stage?.setPickFilter(toggleKind(stage.pickFilter, kind as PickKind))} />
      </span>
      <ToolGroup label="Render quality" options={shadingOptions} value={stage.shading} stroke={1.75}
        onchoose={mode => updatePreview({ shading: mode as ShadingMode })} />
      <GridSnapMenu />
      <ViewMenu bind:this={viewMenu} format={spread?.format ?? "spread"} />
      <!-- #269: the stage runs the book live (Unreal's Realtime) – Live off holds the entities' clock for placing; Restart is a new game -->
      <span class="tool-group live" role="group" aria-label="Live">
        <button type="button" class="icon-button" class:on={stage.live} aria-pressed={stage.live} onclick={() => stage?.setLive(!stage.live)}
          aria-label={stage.live ? "Live: on" : "Live: off"} title={stage.live ? "Live: the scene moves by itself – click to hold it still for placing" : "Held: the scene stands still – click to let it move again"}
          data-help-name="Live" data-help="On: the stage plays the book as a reader sees it – components, clips, the book's code move by themselves. Off: their clock holds, so the scene stands still while you place things; what is found still appears. The code is loaded either way.">
          <Icon name={stage.live ? "pause" : "play"} /></button>
        <button type="button" class="icon-button" onclick={() => stage?.resetNarrative()} aria-label="Restart" title="Restart: a new game – nothing found, no variables; every reveal plays again"
          data-help-name="Restart" data-help="A new game on the stage: nothing found, every variable cleared, the timeline empty – the spread's targets are found anew and play their reveal, as a reader meets the page the first time.">
          <Icon name="replay" /></button>
      </span>
    </div>
  {/if}
{/snippet}

{#snippet tabButtons()}
  {#each TAB_BUTTONS as b (b.tab)}
    <!-- A panel too narrow for the words shows the tabs as icons, so the row stays one line (the name is the tooltip
         and the label – #172) -->
      <button type="button" class="pill tab" class:icon-tab={iconTabs} class:on={shown === b.tab} aria-pressed={shown === b.tab}
        aria-label={iconTabs ? b.label : undefined} title={iconTabs ? `${b.label}${b.title ? ` – ${b.title}` : ""}` : b.title}
        onclick={() => chooseTab(b.tab)}>{#if iconTabs}<Icon name={b.icon} />{:else}{b.label}{/if}</button>
  {/each}
{/snippet}

{#snippet treeBody()}
  <TreePanel {stage} {spreadId} onselect={select} onaddtarget={() => { addingEntry = false; addingTarget = true; }}
    onaddentry={() => { addingTarget = false; addingSpread = null; addingEntry = true; }}
    onaddspread={canAddSpread ? openNewSpread : undefined} onremoveentry={removeEntry} />
{/snippet}

{#snippet panelBody()}
  {#if removal}
    <div class="body removal"><RemovalConfirm step={removal.step} busy={removalBusy} error={removalError} onconfirm={deleteFiles => void confirmRemoval(deleteFiles)} oncancel={() => (removal = null)} /></div>
  {:else if addingTarget && spread}
    <div class="body"><NewTargetForm {bookId} {spread} {stage} oncreated={targetCreated} oncancel={() => (addingTarget = false)} /></div>
  {:else if addingSpread}
    <div class="body"><NewSpreadForm {bookId} spreads={content.spreads} after={addingSpread.after} oncreated={spreadCreated} oncancel={() => (addingSpread = null)} /></div>
  {:else if addingEntry && spread}
    <div class="body"><NewEntryForm {bookId} {spread} oncreated={entryCreated} oncancel={() => (addingEntry = false)} /></div>
  {:else if shown === "tree"}
    <div class="body">{@render treeBody()}</div>
  {:else if shown === "inspector"}
    <div class="body"><EntityPanel bind:this={entityPanel} {stage} {bookId} {spreadId} selected={selection.target} bind:node={selection.node} {pickColour} ontargetchanged={reloadContent} oncode={() => openTab("code")} onenvironment={() => openTab("environment")} /></div>
  {:else if shown === "environment"}
    <div class="body"><EnvironmentPanel {stage} {bookId} /></div>
  {:else if shown === "library"}
    <div class="body"><LibraryPanel {bookId} nodeType={selectedNodeType} targetId={selection.target} onuse={useAsset} onusetarget={useAsTargetImage} onchanged={reloadContent} onopencode={() => openTab("code")} /></div>
  {:else if shown === "code"}
    <div class="body code"><CodePanel {bookId} {stage} /></div>
  {/if}
{/snippet}

<div class="workspace" class:holding={!!floats.held} bind:this={workspace} bind:clientWidth={workspaceWidth} bind:clientHeight={workspaceHeight}>
  <div class="stage" bind:this={container}
    data-help-name="Stage" data-help={NAVIGATION_HELP}>
    {#if stage && stage.status === "running"}
      {#if stageMenu?.hit}
        {@const hit = stageMenu.hit}
        {@const hasTree = !!stage.treeOf(hit.targetId)}
        <ContextMenu at={stageMenu} label="Target" head="{hit.targetId}{hit.path.length ? ` › ${hit.path.join(' › ')}` : ''}" onclose={() => (stageMenu = null)} items={[
          { label: hasTree ? "Add node…" : "Add AR content…", select: menuAddNode },
          ...(hasTree ? [{ label: hit.path.length ? "Remove node" : "Remove entity", select: menuRemoveNode }] : []),
          { label: "Placement on the page…", select: menuPlacement },
          { label: "Replay the first find", select: () => stage?.replayUnlock() },
          { label: "Library…", select: () => chooseTab("library") },
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
    {#if stage?.subtitle}
      <p class="subtitle" data-help-name="Subtitle" data-help="What the playing video says: the cue of its subtitle file – a WebVTT file named like the video with a language, speak.en.vtt beside speak.mp4. The stage shows English; a reader sees their own language.">{stage.subtitle}</p>
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

  <!-- The panels float over the stage, in the order of growth (#308) -->
    <FloatingPanel {floats} id="tree">
      <div class="float-body"><div class="body tree-body">{@render treeBody()}</div></div>
    </FloatingPanel>
    <FloatingPanel {floats} id="inspector">
      {#snippet head()}
        <!-- Back to the spreads is the top bar's book crumb; ‹ › live in the Scenes panel's head (#307) -->
        <span class="float-tabs" role="group" aria-label="Inspector tabs">{@render tabButtons()}</span>
        {#if canAddSpread && atLastSpread}
          <button type="button" class="icon-button" onclick={() => openNewSpread(spreadId)} title="Add a spread after the last one" aria-label="Add a spread"
            data-help-name="Add a spread" data-help="Opens the creation step for a new spread – a double page after this one, or a cover the book does not have yet."><Icon name="plus" /></button>
        {/if}
      {/snippet}
      <div class="float-body inspector">{@render panelBody()}</div>
    </FloatingPanel>
    <FloatingPanel {floats} id="scenes">
      <ScenesPanel {bookId} bookTitle={scenes.tree?.book.title ?? ""} current={spreadId} selectedGroup={selection.group} {sheetLayout} floating
        pageImages={pageImages.bookId === bookId ? pageImages.byKey : {}} assetsBase={content.assetsBase ?? ""} onopen={id => void openScene(id)} onselectgroup={selectGroup} onstep={step} />
    </FloatingPanel>
    <FloatingPanel {floats} id="info">
      <InfoView floating />
    </FloatingPanel>
    {#if stage && stage.status === "running"}
      <FloatingPanel {floats} id="tools" label="Stage tools">{@render toolbar()}</FloatingPanel>
    {/if}
</div>

<style>
  /* Desktop and iPad (#308): the stage is the whole window, the panels float over it (the phone's sheet is gone, #317) */
  .workspace { position: fixed; inset: var(--top-height) 0 0; background: var(--stage-background); }
  .workspace > .stage { position: absolute; inset: 0; }
  .workspace.holding { user-select: none; }
  .workspace.holding .stage :global(iframe.stage-frame) { pointer-events: none; }
  .float-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .float-body.inspector { min-width: 0; }
  .float-tabs { display: flex; align-items: center; gap: .125rem; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .float-tabs .tab { flex: none; padding: 0 .375rem; }
  .float-tabs .tab.on { background: var(--surface); }
  .float-tabs .tab.icon-tab { padding: 0; width: var(--control-height); justify-content: center; }
  /* The toolbar in its floating panel: one row; the page computes the groups' widths from these sizes */
  .tools { display: flex; flex-wrap: nowrap; align-items: center; gap: .125rem; width: max-content; color: var(--text); }
  /* A column (#315): the groups below each other, a rule above each instead of beside it */
  .tools.vertical { flex-direction: column; width: auto; }
  .tools.vertical .live, .tools.vertical .filters { flex-direction: column; }
  .tools :global(.tool-group + .tool-group) { margin-left: .125rem; padding-left: .25rem; border-left: 1px solid var(--line); }
  .tools.vertical :global(.tool-group + .tool-group) { margin: .125rem 0 0; padding: .25rem 0 0; border-left: 0; border-top: 1px solid var(--line); }
  .live, .filters { display: flex; gap: .125rem; }
  .live .on { color: var(--accent, currentColor); }
  .tree-body { padding: .25rem .375rem .75rem; }
  .stage { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  /* The stage frame (#234) under the toolbar and the notices; a panel drag over it stays the page's */
  .stage :global(iframe.stage-frame) { position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; }
  .subtitle { position: absolute; left: 50%; bottom: 3rem; transform: translateX(-50%); z-index: 1; margin: 0; max-width: min(34rem, calc(100% - 2rem)); padding: .25rem .75rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); text-align: center; white-space: pre-line; pointer-events: none; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
  .picker { position: absolute; inset: 0; z-index: 2; cursor: crosshair; outline: none; touch-action: none; }
  .pick-chip { position: absolute; pointer-events: none; display: inline-flex; align-items: center; gap: .375rem; height: var(--control-height); padding: 0 .5rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: var(--text-small); font-family: ui-monospace, Consolas, monospace; }
  .pick-chip::before { content: ""; width: .875rem; height: .875rem; border-radius: 50%; border: 1px solid var(--line); background: var(--c); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; container: panel / inline-size; }
  .body.code { overflow: hidden; }
  .icon-button { text-decoration: none; }
</style>
