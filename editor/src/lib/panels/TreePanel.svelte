<script lang="ts">
  import { onMount } from "svelte";
  import { getEntityRef } from "@engine/content/game-config";
  import { sceneLabel } from "@engine/content/scenes";
  import { isTargetEnabled, nodeTypeSpec, type EntityData, type Entry, type Target } from "@engine/types";
  import { content } from "#lib/content.svelte.js";
  import { Stage } from "#lib/stage/stage.svelte.js";
  import { getPreview, isNodeHidden, nodeKey as hiddenKey, setNodeHidden, setTargetHidden, subscribePreview, type PreviewState } from "#lib/stage/preview.js";
  import { selection } from "#lib/selection.svelte.js";
  import { itemOf, type SelectionItem } from "#lib/selection.js";
  import { duplicateNode, groupNode, indentNode, isWithin, moveNode, nodeLabel, outdentNode, shiftNode, visiblePaths, type DropZone, type TreeEdit } from "#lib/tree.js";
  import { isRowOn, parentRow, rowSelection, stepRow, treeRows, type TreeRow } from "#lib/tree-rows.js";
  import { entryRowHelp } from "#lib/entry-view.js";
  import { nodeAt } from "#lib/values.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import { menuTrigger } from "#lib/menu-trigger.js";
  import { isMenuKey, type Point } from "#lib/context-menu.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { errorText } from "#lib/api.js";
  import { SURFACE_PRESETS, liesOn, surfaceName, type SurfacePreset } from "#lib/surface-edit.js";
  import { addSceneSurface, arrangeSceneInRow, canArrangeInRow, moveSceneSurface, moveTargetToSurface } from "#lib/surface-actions.js";
  import { surfaceRemoval } from "#lib/surface-removal.svelte.js";
  import { ENTITY_TYPES, pluginNodeTypes } from "@engine/types";
  import { nodeAssetKinds } from "#lib/library-pick.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { nodeAdd } from "#lib/node-add.svelte.js";
  import { filterTreeAdd, treeAddItems, type TreeAddItem } from "#lib/tree-add.js";
  import LogicMenu from "./LogicMenu.svelte";

  /**
   * The scene as a tree in the style of Blender's outliner: a chevron column, a type icon before every name, guide
   * lines per depth, zebra rows, the eye in a column at the right (a target's: shown = found, off = reported lost; a
   * node's, #311: off = not drawn on the stage with its children, to look into a complex tree – never the content). Rows: the
   * scene, its surfaces, its entries in order, each entry's target, and the target's
   * entity as its **node tree** (the root node and its children, as deep as the content nests
   * them), each node by its name or its type. It reads and writes the workspace's one selection
   * (`selection.svelte.ts`, #162; the rows' rules in `tree-rows.ts`): every row is selectable (#227) and the Inspector
   * shows what a tap selects (#229) – on the scene row the scene (no target or node on the stage), on an entry row
   * the entry (the stage outlines its target), on a target row the target, on a node row the node. A tap anywhere on
   * a row selects it – its name, its icon or an empty cell; the chevron and the eye keep their own. The selected row is
   * highlighted over its whole width, the hovered one lighter, the rows above a selected node marked.
   * Hierarchy (#163): a node row is dragged onto another row (its child) or between two rows (its sibling, the
   * order set) – with a finger by its type icon; the keys: ↑ ↓ walk all rows, ← → fold / unfold (← elsewhere steps up
   * a level), Alt + ↑ ↓ move the node among its siblings, Tab / Shift + Tab indent / outdent, Enter opens the row's
   * panel, Delete removes the node – on an entry row it asks first (#198's confirmation), on a surface row its Inspector asks (#337). An entry, target or node
   * row's menu (`ContextMenu`: a right click, a long press, or the menu key for the selected row) has the same moves
   * and the removal; the scene row has one too – *Arrange in a row* (#319) and *Add a scene after*
   * (#238). Changes are live on the stage
   * (`stage.editTree`) and saved by themselves (#259). Folding is per entry and per node and not stored. ● after a name: its tree is
   * not in the draft yet (a save waits, or something keeps it back – the top bar says what).
   */
  let { stage, sceneId, onselect, onaddtarget, onaddentry, onaddscene, onremoveentry, ontargetchanged }: {
    stage: Stage | null; sceneId: string;
    /** A row was chosen (a tap, Enter): the workspace shows the Inspector */
    onselect?: (kind: TreeRow["kind"]) => void;
    /** The + menu's *target…*: the workspace opens the form */
    onaddtarget?: () => void;
    /** The + menu's *entry…* (an entry without a printed image, #237): the workspace opens the form */
    onaddentry?: () => void;
    /** The scene row's menu *Add a scene after* (#238 – every experience adds scenes, #320): the workspace opens the creation step */
    onaddscene?: (after: string) => void;
    /** "Remove target" / "Remove entry", Delete on an entry row: the entry with everything on it, after the confirmation the workspace shows (#198) */
    onremoveentry?: (entryId: string, targetId: string | null) => Promise<void>;
    /** A target was moved to another surface (#314): the workspace reads the content again and builds the stage */
    ontargetchanged?: () => Promise<void>;
  } = $props();

  const scene = $derived(content.scene(sceneId));
  let preview = $state<PreviewState>(getPreview());
  onMount(() => subscribePreview(state => (preview = state)));

  let folded = $state<Record<string, boolean>>({});
  const fold = (key: string, to?: boolean) => (folded = { ...folded, [key]: to ?? !folded[key] });
  const nodeKey = (target: Target | string, path: number[]) => `${typeof target === "string" ? target : target.id}:${path.join(".")}`;

  /** The targets that can be selected (with an image), in tree order */
  const selectable = $derived((scene?.entries ?? []).map(entry => entry.target).filter((t): t is Target => !!t?.imageSrc));

  /** The entity shown for a target: the stage's override (a live edit, or removed) or the draft's */
  const treeOf = (target: Target): EntityData | undefined => {
    const override = stage?.overrideOf(target.id);
    if (override === Stage.REMOVED) return undefined;
    return override ?? target.entity;
  };

  /** The thing a row stands for in a multi-selection (#369); null for the scene's row */
  const rowItem = (row: TreeRow): SelectionItem | null => itemOf(rowSelection(row));
  /**
   * A tap (or Enter) on a row: it is selected, the workspace shows its panel. With Ctrl (#369, Blender's outliner) it is
   * added to the selection or taken out of it, with Shift the rows from the active one to it are selected.
   */
  const pick = (row: TreeRow, event?: MouseEvent) => {
    const item = rowItem(row);
    if (event && item && (event.ctrlKey || event.metaKey)) {
      selection.toggle(item);
      return;
    }
    if (event && item && event.shiftKey) {
      selection.range(item, rows.flatMap(r => rowItem(r) ?? []));
      return;
    }
    selection.set(rowSelection(row));
    onselect?.(row.kind);
  };
  /** Selected but not the active one (#369): marked lighter than the active row */
  const isOther = (row: TreeRow) => {
    const item = rowItem(row);
    return !!item && selection.isOther(item);
  };
  const entryRow = (entry: Entry): TreeRow => ({ kind: "entry", entryId: entry.id, targetId: entry.target?.id ?? null });
  const hasTree = (targetId: string) => {
    const target = selectable.find(t => t.id === targetId);
    return !!target && !!treeOf(target);
  };
  const isOn = (row: TreeRow) => isRowOn(row, selection, hasTree);
  const sceneOn = $derived(isOn({ kind: "scene" }));
  const isTargetOn = (target: Target) => isOn({ kind: "target", targetId: target.id });
  const isNodeOn = (target: Target, path: number[]) => isOn({ kind: "node", targetId: target.id, path });
  /** A row above the selected node (its target, its parents): marked lighter, so the level is clear */
  const isWithinOn = (target: Target, path: number[] | null) =>
    !selection.scene && !selection.entry && selection.target === target.id && !selection.onTarget
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
    const target = selection.target && !selection.entry && !selection.scene ? selectable.find(t => t.id === selection.target) : undefined;
    return target && !selection.onTarget && treeOf(target) ? { target, path: selection.node } : null;
  };
  const shift = (direction: -1 | 1) => { const s = selectedNode(); return !!s && edit(s.target, tree => shiftNode(tree, s.path, direction)); };
  const indent = () => { const s = selectedNode(); return !!s && edit(s.target, tree => indentNode(tree, s.path)); };
  const outdent = () => { const s = selectedNode(); return !!s && edit(s.target, tree => outdentNode(tree, s.path)); };
  /** The footer's duplicate and group (#339): the selected node copied right after it / put into a new group */
  const duplicate = () => { const s = selectedNode(); return !!s && edit(s.target, tree => duplicateNode(tree, s.path)); };
  const group = () => { const s = selectedNode(); return !!s && edit(s.target, tree => groupNode(tree, s.path)); };

  // ── the Surfaces level (#314): the scene's surfaces under the scene row – a tap selects one (the Inspector shows it,
  // the stage highlights it), + adds a page / wall / custom one, Alt ↑ ↓ or the menu reorder ──
  const sceneSurfaces = $derived(scenes.scene(sceneId)?.surfaces ?? []);
  const surfacesOpen = $derived(!folded["surfaces"]);
  let surfaceError = $state<string | null>(null);
  const runSurface = async (action: () => Promise<unknown>) => {
    surfaceError = null;
    try {
      await action();
    } catch (e) {
      surfaceError = errorText(e);
    }
  };
  const addSurfaceRow = (preset: SurfacePreset) =>
    runSurface(async () => {
      fold("surfaces", false);
      if (await addSceneSurface(sceneId, preset)) onselect?.("surface");
    });
  /** The selected surface of this scene, while one is */
  const selectedSurface = () => (selection.surface?.scene === sceneId ? selection.surface.id : null);
  const shiftSurface = (direction: -1 | 1): boolean => {
    const id = selectedSurface();
    if (!id) return false;
    void runSurface(() => moveSceneSurface(sceneId, id, direction));
    return true;
  };
  // ── the Tree's + (#337, `tree-add.ts`): one menu of everything that can be added – surfaces, a target, an entry, a node of
  // every type (onto the selected target, entry or node; else greyed out with why), filtered by typing ──
  let addMenu = $state<{ at: Point } | null>(null);
  let addQuery = $state("");
  const addTarget = $derived.by((): Target | null => {
    const id = selection.target;
    return id ? (scene?.entries.find(e => e.target?.id === id)?.target ?? null) : null;
  });
  const addItems = $derived.by((): TreeAddItem[] => {
    void plugins.version;
    const t = addTarget;
    const tree = t ? treeOf(t) : undefined;
    const path = selection.node;
    const node = t && tree && !selection.onTarget ? nodeAt(tree, path) : undefined;
    return filterTreeAdd(treeAddItems({
      target: t?.id ?? null, hasEntity: !!tree, node: t && node ? rowName(node, t, path) : null,
      builtIn: ENTITY_TYPES, plugins: pluginNodeTypes(), takesFile: type => !!nodeAssetKinds(type),
      canAddTarget: !!onaddtarget, canAddEntry: !!onaddentry,
    }), addQuery);
  });
  const runAdd = (item: TreeAddItem) => {
    const a = item.add;
    if (a.add === "surface") void addSurfaceRow(a.preset);
    else if (a.add === "target") onaddtarget?.();
    else if (a.add === "entry") onaddentry?.();
    else {
      const t = addTarget;
      if (!t) return;
      // Onto the target's AR content: the selected node stays, an entry or the target itself selects the root (none: the target)
      if (treeOf(t)) { if (selection.onTarget || selection.entry) selection.selectNode(t.id, []); }
      else selection.selectTarget(t.id);
      nodeAdd.ask(a.type);
      onselect?.("node");
    }
  };
  const openAddMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    addQuery = "";
    addMenu = { at: { x: r.left, y: r.top } };
  };

  /** Remove a surface: selected, its Inspector asks first (`surfaceRemoval`, #337) */
  const askSurfaceRemoval = (surfaceId: string) => {
    selection.selectSurface(sceneId, surfaceId);
    surfaceRemoval.ask(sceneId, surfaceId);
    onselect?.("surface");
  };
  const PRESET_HELP: Record<SurfacePreset, string> = {
    double: "A double page: one surface twice the page's width (460 × 320 mm), flat beside the others.",
    single: "A single page (230 × 320 mm), flat beside the others.",
    wall: "A wall, 2000 × 1500 mm, standing ahead behind the pages.",
    custom: "A surface of 300 × 300 mm – set its size in the Inspector.",
  };
  const surfaceMenu = (surfaceId: string) => menuTrigger({
    open: at => { selection.selectSurface(sceneId, surfaceId); menu = { at, kind: "surface", surfaceId }; },
    pressing: pressed(`surface:${surfaceId}`),
  });

  // ── a surface's targets (#314): the targets placed on it, under its row (folded at first); one is dragged onto
  // another surface's row – or moved by its menu – to lie there (`moveTargetToSurface`: its place kept where it fits,
  // else centred) ──
  /** The targets whose place lies on a surface, with their entry's title */
  const targetsOn = (surfaceId: string): { target: Target; title: string }[] =>
    (scene?.entries ?? []).flatMap(e => (e.target?.place && liesOn(e.target.place, { id: surfaceId }, sceneSurfaces) ? [{ target: e.target, title: e.title }] : []));
  const surfaceOpen = (surfaceId: string) => folded[`surface-open:${surfaceId}`] === true;
  const moveToOther = (targetId: string, surfaceId: string) =>
    runSurface(async () => {
      const how = await moveTargetToSurface(sceneId, targetId, surfaceId, stage?.placeOf(targetId)?.height);
      if (!how) return;
      fold(`surface-open:${surfaceId}`, true);
      await ontargetchanged?.();
      selection.selectTarget(targetId);
    });
  let surfaceDrag = $state<{ targetId: string; from: string; pointerId: number; startY: number; active: boolean } | null>(null);
  let surfaceDrop = $state<string | null>(null);
  let swallowSurfaceClick = false;
  const surfaceDragDown = (event: PointerEvent, targetId: string, from: string) => {
    swallowSurfaceClick = false;
    if (event.button !== 0 || sceneSurfaces.length < 2) return;
    surfaceDrag = { targetId, from, pointerId: event.pointerId, startY: event.clientY, active: false };
  };
  const surfaceDragMove = (event: PointerEvent) => {
    const d = surfaceDrag;
    if (!d || event.pointerId !== d.pointerId) return;
    if (!d.active) {
      if (Math.abs(event.clientY - d.startY) < DRAG_PX) return;
      d.active = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-surface-drop]")?.dataset.surfaceDrop ?? null;
    surfaceDrop = over && over !== d.from ? over : null;
  };
  const surfaceDragUp = (event: PointerEvent) => {
    const d = surfaceDrag;
    if (!d || event.pointerId !== d.pointerId) return;
    surfaceDrag = null;
    const onto = surfaceDrop;
    surfaceDrop = null;
    if (!d.active) return;
    swallowSurfaceClick = true;
    if (onto && event.type === "pointerup") void moveToOther(d.targetId, onto);
  };
  const surfaceTargetClick = (targetId: string, event?: MouseEvent) => {
    if (swallowSurfaceClick) { swallowSurfaceClick = false; return; }
    pick({ kind: "target", targetId }, event);
  };
  const surfaceTargetMenu = (targetId: string, surfaceId: string) => menuTrigger({
    open: at => { selection.selectTarget(targetId); menu = { at, kind: "surface-target", targetId, surfaceId }; },
    pressing: pressed(`surface-target:${targetId}`),
  });

  // ── a row's context menu (a right click, a long press, the menu key): remove, and the hierarchy's moves ──
  type Menu = { at: Point; kind: "scene" } | { at: Point; kind: "surfaces" } | { at: Point; kind: "surface"; surfaceId: string } | { at: Point; kind: "surface-target"; targetId: string; surfaceId: string } | { at: Point; kind: "entry"; entry: Entry } | { at: Point; kind: "node" | "target"; target: Target; path: number[] };
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
  /** The scene row's menu: *arrange in a row*, and *add a scene after* (every experience adds scenes, #320) */
  const sceneMenu = () => (element: HTMLElement) =>
    menuTrigger({ open: at => { pick({ kind: "scene" }); menu = { at, kind: "scene" }; }, pressing: pressed("scene") })(element);
  /** Remove an entry with everything on it: the workspace shows the API's impact and asks first (#198) */
  const removeEntry = (entry: Entry) => void onremoveentry?.(entry.id, entry.target?.id ?? null);
  const EYE_HELP = "Shows or hides this target in the scene – its printed image and its AR content. Hidden, the stage reports the target lost (a behaviour's lost and found run when you hide and show it). Only the stage changes: whether readers find it is the Inspector's In the experience switch.";
  const NODE_EYE_HELP = "Shows or hides this node with its children on the stage only – to look into a complex tree. The content does not change: readers see the node as always. Forgotten when you leave the editor.";
  const REMOVE_ENTRY_HELP ="Removes the entry with its target, its entity and – only if you choose it – the Library files used only there. It shows what goes and asks first.";
  const menuItems = (m: Menu): MenuItem[] => {
    if (m.kind === "surfaces") {
      return SURFACE_PRESETS.map(preset => ({ label: `+ ${preset}`, icon: "plus", select: () => void addSurfaceRow(preset), help: PRESET_HELP[preset] }));
    }
    if (m.kind === "surface") {
      const at = sceneSurfaces.findIndex(s => s.id === m.surfaceId);
      return [
        { label: "Move up", icon: "up", keys: "Alt ↑", disabled: at <= 0 && "It is the scene's first surface.", select: () => void runSurface(() => moveSceneSurface(sceneId, m.surfaceId, -1)),
          help: "Moves the surface one place earlier in the scene." },
        { label: "Move down", icon: "down", keys: "Alt ↓", disabled: at >= sceneSurfaces.length - 1 && "It is the scene's last surface.", select: () => void runSurface(() => moveSceneSurface(sceneId, m.surfaceId, 1)),
          help: "Moves the surface one place later in the scene." },
        { label: "Edit in the Inspector", icon: "surface", select: () => onselect?.("surface"),
          help: "Shows the surface in the Inspector: its label, size, place, reference image – and remove surface." },
        { label: "Remove surface…", icon: "trash", keys: "Delete", danger: true, select: () => askSurfaceRemoval(m.surfaceId),
          help: "Shows the surface in the Inspector with its removal's confirmation – what lies on it falls back to the first surface; nothing goes before you confirm." },
        { label: "Arrange the scene in a row", icon: "surface", disabled: !canArrangeInRow(sceneId) && "The surfaces lie in a row already.", select: () => void runSurface(() => arrangeSceneInRow(sceneId)),
          help: "Lays the scene's surfaces flat on the table, side by side in their order, touching, the row centred on the origin – written to their places." },
      ];
    }
    if (m.kind === "surface-target") {
      const others = sceneSurfaces.filter(s => s.id !== m.surfaceId);
      return [
        ...others.map((s): MenuItem => ({ label: `Move to ${surfaceName(s)}`, icon: "surface", select: () => void moveToOther(m.targetId, s.id),
          help: "Moves the target onto this surface: it keeps its place in mm where it fits there, else it is centred (made smaller when it is too big)." })),
        { label: "Select the target", icon: "target", select: () => pick({ kind: "target", targetId: m.targetId }),
          help: "Selects the target: the Inspector shows its printed image and placement, the stage outlines its print." },
      ];
    }
    if (m.kind === "scene") {
      if (!scene) return [];
      const arrange: MenuItem = { label: "Arrange in a row", icon: "surface", disabled: !canArrangeInRow(sceneId) && "The surfaces lie in a row already.",
        select: () => void runSurface(() => arrangeSceneInRow(sceneId)),
        help: "Lays the scene's surfaces flat on the table, side by side in their order, touching, the row centred on the origin – written to their places." };
      const add: MenuItem[] = onaddscene ? [{ label: "Add a scene after", icon: "plus", select: () => onaddscene?.(scene.id),
        help: "Opens the creation step for a new scene right after this one: a double page, a single page or a wall." }] : [];
      return [arrange, ...add];
    }
    if (m.kind === "entry") {
      const target = m.entry.target;
      const select: MenuItem[] = target?.imageSrc
        ? [{ label: "Select the target", icon: "target", select: () => pick({ kind: "target", targetId: target.id }),
            help: "Selects the entry's target: the Inspector shows its printed image and placement, the stage outlines its print." }]
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
      help: m.path.length ? "Removes the node with its children – live on the stage and saved by itself; Undo edits in the Inspector brings it back." : "Removes the entity: the target keeps no AR content – live on the stage and saved by itself; Undo edits in the Inspector brings it back." }];
  };
  /** What the menu is for: the entry's title, the target's id, or the node's name */
  const menuHead = (m: Menu): string => {
    if (m.kind === "scene") return scene ? sceneLabel(scene) : sceneId;
    if (m.kind === "surfaces") return "+ surface";
    if (m.kind === "surface") { const s = sceneSurfaces.find(x => x.id === m.surfaceId); return s ? surfaceName(s) : m.surfaceId; }
    if (m.kind === "entry") return m.entry.title;
    if (m.kind === "surface-target") return m.targetId;
    if (m.kind === "target") return m.target.id;
    const tree = treeOf(m.target);
    const node = tree ? nodeAt(tree, m.path) : undefined;
    return node ? rowName(node, m.target, m.path) : m.target.id;
  };
  /** The menu key on the tree: the selected row's menu, at its name (the scene row has none) */
  const openKeyMenu = () => {
    const row = rows[currentRow()];
    const button = treeElement?.querySelector<HTMLElement>(".node.on .pick");
    if (!row || !button) return;
    if (row.kind === "scene") {
      const rect = button.getBoundingClientRect();
      menu = { at: { x: rect.left + Math.min(16, rect.width / 2), y: rect.top + rect.height / 2 }, kind: "scene" };
      return;
    }
    const rect = button.getBoundingClientRect();
    const at = { x: rect.left + Math.min(16, rect.width / 2), y: rect.top + rect.height / 2 };
    if (row.kind === "surface") {
      menu = { at, kind: "surface", surfaceId: row.surfaceId };
      return;
    }
    if (row.kind === "entry") {
      const entry = scene?.entries.find(e => e.id === row.entryId);
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
  /** Delete / Backspace and the footer's trash: an entry goes only after the confirmation (#198), a surface after its
   *  Inspector asks (#337), a node at once (live on the stage, saved by itself) */
  const removeRow = (row: TreeRow | undefined) => {
    const entry = row?.kind === "entry" ? scene?.entries.find(e => e.id === row.entryId) : undefined;
    if (entry) removeEntry(entry);
    else if (row?.kind === "surface") askSurfaceRemoval(row.surfaceId);
    else removeSelected();
  };
  const entryOf = (targetId: string): Entry | undefined => scene?.entries.find(entry => entry.target?.id === targetId);

  // ── the keys: the rows as they are shown, in order – the scene, the entries, their targets and nodes (#227) ──
  const rows = $derived.by<TreeRow[]>(() =>
    treeRows(scene?.entries ?? [], {
      isOpen: entryId => !folded[entryId],
      nodes: targetId => {
        const target = selectable.find(t => t.id === targetId);
        const tree = target ? treeOf(target) : undefined;
        return tree ? visiblePaths(tree, path => !folded[nodeKey(targetId, path)]) : [];
      },
      surfaces: { sceneId: sceneId, ids: surfacesOpen ? sceneSurfaces.map(s => s.id) : [] },
    }),
  );
  const currentRow = () => rows.findIndex(isOn);
  const selectRow = (row: TreeRow | undefined) => {
    if (row) selection.set(rowSelection(row));
  };
  /** A row's fold key and whether rows hang below it: an entry folds its target, a node its children */
  const foldOf = (row: TreeRow | undefined): { key?: string; children: boolean } => {
    if (!row) return { children: false };
    if (row.kind === "scene") return { children: !!scene?.entries.length };
    if (row.kind === "surface") return { children: false };
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
        if (event.altKey) { if (!shift(1) && !shiftSurface(1)) return; break; }
        selectRow(stepRow(rows, index, 1));
        break;
      case "ArrowUp":
        if (event.altKey) { if (!shift(-1) && !shiftSurface(-1)) return; break; }
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
      case "Delete": case "Backspace": removeRow(row); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  /** What the footer's buttons act on: the selected row (#339) */
  const currentTreeRow = $derived(rows.find(isOn));
  const nodeSelected = $derived(currentTreeRow?.kind === "node");
  const removable = $derived(nodeSelected || currentTreeRow?.kind === "entry" || currentTreeRow?.kind === "surface");

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
  /**
   * A click on a row beside its name – its type icon, an empty chevron or eye cell, its guides – selects the row as a
   * click on the name does (#229: the scene row's experience icon took no click; a tree selects by its whole row)
   */
  const rowClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest("button, a, input, select")) return;
    target.closest(".node")?.querySelector<HTMLButtonElement>(":scope > .pick")?.click();
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
  {@const own = preview.hiddenNodes.includes(hiddenKey(target.id, path))}
  {@const drawn = shown && !isNodeHidden(preview.hiddenNodes, target.id, path)}
  <div class="node" class:on class:other={isOther({ kind: "node", targetId: target.id, path })} class:within={isWithinOn(target, path)} class:pressing={pressing === key} class:dragged={!!drag?.active && drag.target.id === target.id && isWithin(path, drag.from)}
    class:drop-before={dropZone === "before"} class:drop-inside={dropZone === "inside"} class:drop-after={dropZone === "after"}
    role="treeitem" aria-expanded={children.length ? open : undefined} aria-selected={on} aria-level={depth + 1}
    data-target={target.id} data-path={path.join(".")} data-drop="node" data-node-type={n.type} style:padding-left="calc(.25rem + {depth} * var(--indent))">
    {@render guides(depth)}
    {#if children.length}
      <button type="button" class="chevron" onclick={() => fold(key)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
    {:else}
      <span class="chevron"></span>
    {/if}
    <span class="type" class:handle={path.length > 0} title={path.length ? "Drag to move the node: onto a row = its child, between rows = its sibling" : undefined}><Icon name={nodeIcon(n)} size="1em" stroke={2} /></span>
    <button type="button" class="pick" class:muted={!drawn} onclick={e => pick({ kind: "node", targetId: target.id, path }, e)} aria-haspopup="menu" {@attach rowMenu(target, path, "node")}
      title={path.length
        ? `${n.type} – a tap selects this node: the Inspector shows its values, the gizmo sits on it on the stage`
        : `${n.type} – a tap selects the entity (its root node): the Inspector shows its values, the gizmo sits on it on the stage`}>
      <span class="name">{rowName(n, target, path)}</span>
      {#if !path.length && stage?.overrideOf(target.id)}<span class="dot" title="Not saved yet">●</span>{/if}
    </button>
    <button type="button" class="eye" aria-pressed={!own} title={own ? "Hidden on the stage – click to show" : "Shown on the stage – click to hide (the stage only, not the content)"}
      aria-label="Shown on the stage" data-help-name="Visibility" data-help={NODE_EYE_HELP} onclick={() => setNodeHidden(target.id, path, !own)}><Icon
      name={own ? "eye-off" : "eye"} size="1em" stroke={2} /></button>
  </div>
  {#if open}
    {#each children as child, i (i)}
      {@render nodeRows(target, child, [...path, i], depth + 1, shown)}
    {/each}
  {/if}
{/snippet}

{#if !scene}
  <p class="muted small">No scene.</p>
{:else}
  <!-- The tree takes the keys and the drags of its rows (a focusable tree is a control) -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="tree" class:dragging={!!drag?.active} role="tree" aria-label="Scene tree" tabindex="0" onkeydown={onKey} bind:this={treeElement}
    onpointerdown={dragDown} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} onlostpointercapture={dragUp} onclickcapture={dragClick} onclick={rowClick}
    data-help-name="Tree" data-help="A tap anywhere on a row selects the scene, a surface, an entry, a target, its entity or a node: the row is highlighted and the Inspector shows it; an entry with a target and a target are outlined on the stage, a node carries the gizmo, the scene clears both. Drag a node onto a row to make it that node's child, between two rows to make it a sibling there (with a finger, drag its icon). Keys: ↑ ↓ walk the rows, ← → fold or step a level up and down, Alt + ↑ ↓ move a node, Tab / Shift + Tab indent / outdent, Enter opens the row's panel, Delete removes a node – on an entry it shows what goes and asks first, on a surface its Inspector asks first. A row's menu – a right click, a long press, or the menu key – has the moves and the removal.">
    <div class="node" class:on={sceneOn} class:pressing={pressing === "scene"} role="treeitem" aria-expanded="true" aria-selected={sceneOn} aria-level={1}>
      <span class="chevron"></span>
      <span class="type"><Icon name="book" size="1em" stroke={2} /></span>
      <button type="button" class="pick" onclick={() => pick({ kind: "scene" })} aria-haspopup="menu" {@attach sceneMenu()}
        title="The scene – a tap selects it: the Inspector shows its label, group, post-processing, rules and the narrative line; its menu arranges the surfaces in a row">
        <span class="name">{sceneLabel(scene)}</span>
      </button>
      <span class="eye"></span>
    </div>
    <!-- The Surfaces level (#314): the scene's surfaces, + adds one -->
    <div class="node depth-1 surfaces-head" class:pressing={pressing === "surfaces"} role="treeitem" aria-expanded={sceneSurfaces.length ? surfacesOpen : undefined} aria-selected={false} aria-level={2}>
      {@render guides(1)}
      {#if sceneSurfaces.length}
        <button type="button" class="chevron" onclick={() => fold("surfaces")} title={surfacesOpen ? "Fold" : "Unfold"} aria-label={surfacesOpen ? "Fold the surfaces" : "Unfold the surfaces"}><Icon name={surfacesOpen ? "down" : "next"} size="1em" /></button>
      {:else}
        <span class="chevron"></span>
      {/if}
      <span class="type"><Icon name="layers" size="1em" stroke={2} /></span>
      <button type="button" class="pick" onclick={() => fold("surfaces")} title="The scene's surfaces – a double page, a cover, a wall; a tap on one selects it">
        <span class="name">Surfaces</span><span class="small muted">{sceneSurfaces.length}</span>
      </button>
      <button type="button" class="eye add-surface" aria-haspopup="menu" title="+ surface: a double or single page, a wall or a custom one" aria-label="Add a surface"
        data-help-name="+ surface" data-help="Adds a surface to the scene: a double or a single page flat beside the others, a wall standing ahead, or a custom one – selected at once, the Inspector shows its fields."
        onclick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu = { at: { x: r.left, y: r.bottom }, kind: "surfaces" }; }}><Icon name="plus" size="1em" stroke={2} /></button>
    </div>
    {#if surfacesOpen}
      {#each sceneSurfaces as surface (surface.id)}
        {@const row = { kind: "surface", sceneId: sceneId, surfaceId: surface.id } as const}
        {@const on = isOn(row)}
        {@const lying = targetsOn(surface.id)}
        {@const open = surfaceOpen(surface.id)}
        <div class="node depth-2" class:on class:other={isOther(row)} class:pressing={pressing === `surface:${surface.id}`} class:drop-inside={surfaceDrop === surface.id}
          role="treeitem" aria-selected={on} aria-expanded={lying.length ? open : undefined} aria-level={3} data-surface-drop={surface.id}>
          {@render guides(2)}
          {#if lying.length}
            <button type="button" class="chevron" onclick={() => fold(`surface-open:${surface.id}`, !open)} title={open ? "Fold its targets" : "Show the targets on it"}
              aria-label={open ? "Fold the targets" : "Unfold the targets"}><Icon name={open ? "down" : "next"} size="1em" /></button>
          {:else}
            <span class="chevron"></span>
          {/if}
          <span class="type"><Icon name="surface" size="1em" stroke={2} /></span>
          <button type="button" class="pick" onclick={e => pick(row, e)} aria-haspopup="menu" {@attach surfaceMenu(surface.id)}
            title="{surface.id}, {Math.round(surface.widthMm)} × {Math.round(surface.heightMm)} mm – a tap selects it: the Inspector shows its fields, the stage highlights it{sceneSurfaces.length > 1 ? '; drop a target from another surface here to move it onto this one' : ''}">
            <span class="name">{surfaceName(surface)}</span>{#if lying.length}<span class="small muted">{lying.length}</span>{/if}
          </button>
          <span class="eye"></span>
        </div>
        {#if open}
          {#each lying as { target, title } (target.id)}
            {@const targetOn = isTargetOn(target)}
            <!-- A target on the surface: a tap selects it, a drag onto another surface's row moves it there (its button takes the focus) -->
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div class="node depth-3 surface-target" class:on={targetOn} class:other={isOther({ kind: "target", targetId: target.id })} class:pressing={pressing === `surface-target:${target.id}`}
              class:dragged={!!surfaceDrag?.active && surfaceDrag.targetId === target.id} role="treeitem" aria-selected={targetOn} aria-level={4}
              onpointerdown={e => surfaceDragDown(e, target.id, surface.id)} onpointermove={surfaceDragMove} onpointerup={surfaceDragUp} onpointercancel={surfaceDragUp}>
              {@render guides(3)}
              <span class="chevron"></span>
              <span class="type" class:handle={sceneSurfaces.length > 1}><Icon name="target" size="1em" stroke={2} /></span>
              <button type="button" class="pick" onclick={e => surfaceTargetClick(target.id, e)} aria-haspopup="menu" {@attach surfaceTargetMenu(target.id, surface.id)}
                title="{target.id} on {surfaceName(surface)} – a tap selects it{sceneSurfaces.length > 1 ? '; drag it onto another surface to move it there (its menu too)' : ''}">
                <span class="name">{title}</span>
              </button>
              <span class="eye"></span>
            </div>
          {/each}
        {/if}
      {/each}
    {/if}
    {#if surfaceError}<p class="small danger">{surfaceError}</p>{/if}
    {#each scene.entries as entry (entry.id)}
      {@const target = entry.target}
      {@const open = !folded[entry.id]}
      {@const shown = !!target && !preview.hidden.includes(target.id)}
      {@const tree = target ? treeOf(target) : undefined}
      {@const entryOn = isOn(entryRow(entry))}
      <div class="node depth-1" class:on={entryOn} class:other={isOther(entryRow(entry))} class:within={!!target && (isTargetOn(target) || isWithinOn(target, null))} class:pressing={pressing === `entry:${entry.id}`}
        role="treeitem" aria-expanded={target ? open : undefined} aria-selected={entryOn} aria-level={2}>
        {@render guides(1)}
        {#if target}
          <button type="button" class="chevron" onclick={() => fold(entry.id)} title={open ? "Fold" : "Unfold"} aria-label={open ? "Fold" : "Unfold"}><Icon name={open ? "down" : "next"} size="1em" /></button>
        {:else}
          <span class="chevron"></span>
        {/if}
        <span class="type"><Icon name="entry" size="1em" stroke={2} /></span>
        <button type="button" class="pick" class:muted={!!target && !shown} onclick={e => pick(entryRow(entry), e)} aria-haspopup="menu" {@attach entryMenu(entry)}
          title={entryRowHelp(entry, !!target?.imageSrc)}>
          <span class="name">{entry.title}</span>
          {#if target && !isTargetEnabled(target)}<span class="off muted" title="Switched off: not in the reader's experience (the Inspector's In the experience switch)" aria-label="Switched off"><Icon name="slash" size="1em" stroke={2} /></span>{/if}
        </button>
        {#if target}
          <button type="button" class="eye" aria-pressed={shown} title={shown ? "Visible in the scene – click to hide" : "Hidden in the scene – click to show"}
            aria-label="Visible in the scene" data-help-name="Visibility" data-help={EYE_HELP} onclick={() => setTargetHidden(target.id, shown)}><Icon
            name={shown ? "eye" : "eye-off"} size="1em" stroke={2} /></button>
        {:else}
          <span class="eye"></span>
        {/if}
      </div>
      {#if target && open}
        {@const on = isTargetOn(target)}
        <div class="node depth-2" class:on class:other={isOther({ kind: "target", targetId: target.id })} class:within={isWithinOn(target, null)} class:pressing={pressing === target.id} role="treeitem" aria-selected={on} aria-level={3}
          data-drop="target" data-target={target.id}>
          {@render guides(2)}
          <span class="chevron"></span>
          <span class="type"><Icon name="target" size="1em" stroke={2} /></span>
          <button type="button" class="pick" class:muted={!shown} onclick={e => pick({ kind: "target", targetId: target.id }, e)} aria-haspopup="menu" {@attach rowMenu(target, [], "target")}
            title={tree
              ? "The target – a tap selects it: the Inspector shows its printed image and placement, the stage outlines its print"
              : "The target, no AR content yet – a tap selects it: the Inspector shows its printed image and placement and adds a node, the stage outlines its print"}>
            <span class="name">{target.id}</span>
          </button>
          <span class="eye"></span>
        </div>
        {#if tree}
          {@render nodeRows(target, tree, [], 3, shown)}
        {/if}
      {/if}
    {/each}
  </div>
  <!-- The footer (#339), as in Photoshop's layers panel: always at the panel's foot, however far the tree scrolls –
       add (one menu of everything), and for the selected row duplicate, group and remove -->
  <div class="footer" role="toolbar" aria-label="Tree actions">
    <button type="button" class="pick add" aria-haspopup="menu" aria-expanded={!!addMenu} onclick={openAddMenu}
      title="Add to the scene: a surface, a target, an entry, or a node onto the selected target or node"
      data-help-name="+" data-help="One menu of everything the scene can get: a surface (double page, single page, wall, custom), a target or an entry (their forms), and a node of every type – a group, a model, a video, an image, a text, a light and the experience's plugins' types. A node goes onto the selected target, entry or node (where the Inspector's + node puts it); without one it is greyed out. A type that takes a file asks for it in the Library. Type to filter, Enter adds; what was added is selected, so the Inspector shows it."><Icon name="plus" size="1em" /><span class="name">add</span></button>
    <span class="actions">
      <button type="button" class="icon-button" disabled={!nodeSelected} onclick={duplicate} aria-label="Duplicate the node"
        title={nodeSelected ? "Duplicate the node with its children, right after it" : "Select a node to duplicate it"}
        data-help-name="Duplicate" data-help="A copy of the selected node with its children right after it – live on the stage and saved by itself. The copy's names get a free number (door → door 2), since rules address nodes by name."><Icon name="copy" size="1em" /></button>
      <button type="button" class="icon-button" disabled={!nodeSelected} onclick={group} aria-label="Group the node"
        title={nodeSelected ? "Put the node into a new group in its place" : "Select a node to group it"}
        data-help-name="Group" data-help="The selected node goes into a new group in its place; it stays where it is on the stage. Grouping the root makes the group the root."><Icon name="layers" size="1em" /></button>
      <button type="button" class="icon-button" disabled={!removable} onclick={() => removeRow(currentTreeRow)} aria-label="Remove"
        title={removable ? "Remove the selected row (Delete)" : "Select a node, an entry or a surface to remove it"}
        data-help-name="Remove" data-help="Removes the selected node at once (Undo edits in the Inspector brings it back); an entry shows what goes and asks first; a surface's Inspector asks first."><Icon name="trash" size="1em" /></button>
    </span>
  </div>
{/if}

{#if addMenu}
  <LogicMenu at={addMenu.at} head="Add to the scene" filter placeholder="Filter – surface, target, entry, a node type"
    items={addItems.map(item => ({ key: item.key, label: item.label, detail: item.detail, group: item.group, disabled: item.disabled, select: () => runAdd(item) }))}
    bind:query={addQuery} onclose={() => (addMenu = null)} />
{/if}

{#if menu}
  <ContextMenu at={menu.at} label={menu.kind === "scene" ? "Scene" : menu.kind === "surfaces" ? "Add a surface" : menu.kind === "surface" ? "Surface" : menu.kind === "entry" ? "Entry" : menu.kind === "target" ? `Target ${menu.target.id}` : "Node"} head={menuHead(menu)} items={menuItems(menu)}
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
  /* The rest of a multi-selection (#369): lighter than the active row, as Blender's outliner */
  .node.other { background: var(--within-background); box-shadow: inset 2px 0 0 var(--muted, var(--line)); }
  .tree:focus-visible .node.on { box-shadow: inset 2px 0 0 var(--text), inset 0 0 0 1px var(--text); }
  .node.dragged { opacity: .45; }
  .node.drop-before { box-shadow: inset 0 2px 0 var(--text); }
  .node.drop-after { box-shadow: inset 0 -2px 0 var(--text); }
  .node.drop-inside { box-shadow: inset 0 0 0 2px var(--text); }
  /* A Library tile over the row (#330, library-drag.svelte.ts – the drag writes the state): it fits, or it does not */
  .tree :global(.node[data-drop-state="ok"]) { box-shadow: inset 0 0 0 2px var(--text); background: var(--hover-background); }
  .tree :global(.node[data-drop-state="no"]) { outline: 1px dashed var(--danger); outline-offset: -1px; cursor: no-drop; }
  .depth-1 { padding-left: calc(.25rem + var(--indent)); }
  .depth-2 { padding-left: calc(.25rem + 2 * var(--indent)); }
  .depth-3 { padding-left: calc(.25rem + 3 * var(--indent)); }
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
  .off { flex: none; display: inline-flex; align-items: center; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { font-size: .6em; }
  /* The footer stays at the panel's foot while the tree scrolls (the panel's body is the scroller; its padding is undone) */
  .footer { position: sticky; bottom: -.75rem; z-index: 1; display: flex; align-items: center; gap: .25rem; margin: auto -.5rem -.75rem; padding: .125rem .5rem;
    border-top: 1px solid var(--line); background: var(--surface); color: var(--muted); }
  .footer .pick.add { flex: none; height: var(--control-height); }
  .footer .actions { margin-left: auto; display: flex; gap: .125rem; }
  @media (hover: hover) {
    .footer .pick.add:hover { color: var(--text); }
  }
  @media (pointer: coarse) {
    .tree { --cell: 1.75rem; }
    .node { height: var(--control-height); }
    .pick { height: 100%; }
    button.chevron, button.eye { height: 100%; }
    .eye { width: var(--control-height); margin-right: -.25rem; }
  }
</style>
