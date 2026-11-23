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
  import { getPreview, subscribePreview, updatePreview, type PreviewOrbit, type ShadingMode } from "#lib/stage/preview.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import ToolGroup, { type ToolGroupOption } from "#lib/components/ToolGroup.svelte";
  import GridSnapMenu from "#lib/components/GridSnapMenu.svelte";
  import ViewMenu from "#lib/components/ViewMenu.svelte";
  import { closesOnResize, expandedGroups, fittingGroups, groupLength, menuPlace, type GroupShape, type ToolbarMetrics } from "#lib/tool-groups.js";
  import EntityPanel from "#lib/panels/EntityPanel.svelte";
  import TreePanel from "#lib/panels/TreePanel.svelte";
  import LibraryPanel from "#lib/panels/LibraryPanel.svelte";
  import CodePanel from "#lib/panels/CodePanel.svelte";
  import EnvironmentPanel from "#lib/panels/EnvironmentPanel.svelte";
  import { environmentEdit, stageEnvironment } from "#lib/environment.svelte.js";
  import { logicEdit } from "#lib/logic-edit.svelte.js";
  import NewTargetForm from "#lib/panels/NewTargetForm.svelte";
  import NewEntryForm from "#lib/panels/NewEntryForm.svelte";
  import NewSceneForm from "#lib/NewSceneForm.svelte";
  import { sceneLabel } from "@engine/content/scenes";
  import { surfaceGrids } from "#lib/surface-grids.svelte.js";
  import { entries } from "#lib/entries.svelte.js";
  import { deleteEntry, deleteScene, errorText, isMediaAsset, putExperience, putTarget, type Asset, type MediaKind } from "#lib/api.js";
  import { extractLanding } from "#lib/landing-pick.js";
  import { landingContentProblem } from "@shared/api/landing-extract";
  import type { SurfaceReferences } from "#lib/stage/surfaces.js";
  import { surfaceMode as surfaceTool } from "#lib/surface-mode.svelte.js";
  import type { SurfacePlace } from "@shared/types/game-config";
  import { sameSurfaces, updateSurface } from "#lib/surface-edit.js";
  import { autosave } from "#lib/autosave.svelte.js";
  import { removalStep, type RemovalStep } from "#lib/removal.js";
  import RemovalConfirm from "#lib/components/RemovalConfirm.svelte";
  import { sceneRemoval } from "#lib/scene-removal.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { libraryDrag } from "#lib/library-drag.svelte.js";
  import type { DropRow } from "#lib/library-drag.js";
  import { recognitionFrames } from "#lib/recognition-frames.svelte.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { nodeAt } from "#lib/values.js";
  import { queueTreeSaves } from "#lib/tree-autosave.js";
  import type { EntityData } from "@engine/types";
  import { selection } from "#lib/selection.svelte.js";
  import { tabOf } from "#lib/panel-tabs.js";
  import InfoView from "#lib/components/InfoView.svelte";
  import ContextMenu from "#lib/components/ContextMenu.svelte";
  import { readStored } from "#lib/storage.js";
  import ScenesPanel from "#lib/ScenesPanel.svelte";
  import { scenes } from "#lib/scenes.svelte.js";
  import FloatingPanel from "#lib/components/FloatingPanel.svelte";
  import Workspace from "#lib/components/Workspace.svelte";
  import { Floats } from "#lib/components/floats.svelte.js";
  import { at, chromeOf, type PanelSpec } from "#lib/components/floats.js";
  import type { TabSpec } from "#lib/components/float-tabs.js";
  import UndoRedo from "#lib/UndoRedo.svelte";
  import HistoryPanel from "#lib/panels/HistoryPanel.svelte";
  import LogicPanel from "#lib/panels/LogicPanel.svelte";
  import LogPanel from "#lib/panels/LogPanel.svelte";
  import StageVariables from "#lib/panels/StageVariables.svelte";
  import type { LogicPick } from "#lib/logic/types.js";
  import type { StageMove } from "#lib/logic/navigation.js";
  import RevertPrompt from "#lib/components/RevertPrompt.svelte";
  import PluginGuardPrompt from "#lib/components/PluginGuardPrompt.svelte";
  import { pluginGuard } from "#lib/plugin-guard.svelte.js";
  import { session } from "#lib/session.svelte.js";
  import { history } from "#lib/history.svelte.js";
  import { markRender, renderRequest, renderState } from "#lib/render-view.js";

  /**
   * The workspace. On a desktop and an iPad (#308) the **stage** (the engine over the mock stage) is the whole window
   * and the panels float over it (`FloatingPanel`, `SCENE_PANELS`): the **Tree** of the scene (a 3D tool's outliner),
   * the **Inspector** (essential) with its tabs Inspector (whatever is selected – the scene while nothing else is,
   * #229), Environment, Library, Code, Log and Variables (`panel-tabs.ts`, #337), the **Scenes** filmstrip (#307, `ScenesPanel.svelte`: a
   * card opens its scene, a band selects its group, a drag reorders; the draft follows `scenes.version`), **Info** and
   * the stage's **Tools** (inline). Every content is a tab (#318, `SCENE_TABS`) that can live in any panel: dragged into
   * another panel's head or out onto the stage (a panel of its own). Each moves by its head, resizes by its edges, folds
   * to its head (a double-click on it) and – unless it holds the Inspector – closes; the top bar's panels menu reopens
   * tabs and resets the layout and the tabs' arrangement, which are remembered per workspace
   * in this browser. The editor is desktop and iPad only (Tilman, 2026-11-18): the phone's layout – a sheet at the
   * bottom with the tree as a tab, ‹ › over the stage – is gone (#317). `?tab=environment` opens a tab.
   * The shell – the window as the stage, the panels over it, their room and the panels menu – is `Workspace.svelte` (#356);
   * this page fills it with the engine, its toolbar and the scene's panels.
   */
  const experienceId = $derived(page.params.experience!);
  const sceneId = $derived(page.params.scene!);
  const TAB_KEY = "osct-editor-tab";
  /**
   * The workspace's tabs (#318): every content of its panels, each with its home panel (`SCENE_PANELS`) – any tab can
   * live in any panel; the Inspector (the selection) never closes
   */
  const SCENE_TABS: TabSpec[] = [
    { id: "tree", name: "Tree", icon: "tree", home: "tree", about: "The scene's surfaces, entries, their targets and the entities' nodes: a click selects, a drag moves a node." },
    { id: "inspector", name: "Inspector", icon: "inspector", home: "inspector", essential: true, about: "Whatever is selected: the scene, a surface, an entry, a target, its entity or a node. The panel holding it never closes." },
    { id: "environment", name: "Environment", icon: "globe", home: "inspector", about: "The sky around the reader and the onion sky, previewed on the stage." },
    { id: "library", name: "Library", icon: "folder", home: "inspector", about: "The experience's files: images, models, videos, sounds and code – use one on the selected node. Ctrl+L opens it and focuses its search." },
    { id: "code", name: "Code", icon: "code", home: "inspector", about: "The experience's code: its plugins' sources, saved with Save or Ctrl+S." },
    { id: "log", name: "Log", icon: "list", home: "inspector", about: "What happens on the stage, newest first: the events, the rules' lines, the plugins' log and the problems – filtered by kind; tap a target here." },
    { id: "variables", name: "Variables", icon: "sliders", home: "inspector", about: "The plugins' variables on the stage: each one's scope, type and value to change or delete, one set by hand, reset for a new game." },
    { id: "scenes", name: "Scenes", icon: "film", home: "scenes", about: "The experience's scenes as a filmstrip: a card opens its scene, a band selects its group, a drag reorders." },
    { id: "info", name: "Info", icon: "info", home: "info", about: "The name and description of the control under the pointer or in focus." },
    { id: "history", name: "History", icon: "history", home: "history", about: "Every saved change of the experience: filter by scene, kind or person; revert one, or jump back to a point (#312)." },
    { id: "logic", name: "Logic", icon: "nodes", home: "logic", about: "The experience's logic as a graph, one level at a time (#239, #334): the experience, a group, a scene, a target's entity – a click selects, a double-click opens a level." },
  ];
  /**
   * `?render[=view]` (#89, render-view.ts): the stage alone at a view preset, for the MCP server's `render_scene` – no
   * panels, no toolbar, no notices; the state on `<html data-osct-render>`
   */
  const render = renderRequest(page.url.searchParams);
  if (render) updatePreview({ view: render.view });

  let container = $state<HTMLDivElement>();
  let stage = $state<Stage | null>(null);
  /** A finger (the workspace says): every control is the touch height (app.css), so the toolbar needs more room */
  let coarse = $state(false);
  // The one selection of the tree, the stage and the Inspector – a target, its entity or a node (#162), the scene to start
  // with (#229) or what the header search asked for on this scene (#237); `reveal` counts the asks to show it
  let revealSeen = untrack(() => selection.reveal);
  untrack(() => selection.enter(sceneId));
  /** The draft or the stage could not be loaded: the stage area shows it with a retry instead of "Building the stage…" */
  let loadError = $state<string | null>(null);
  /** An action on the page failed (a removal, a target image, a reload after a change): shown over the stage until dismissed */
  let actionError = $state<string | null>(null);
  const failed = (e: unknown): void => {
    actionError = errorText(e);
  };

  /** Show a tab where it lives (#318) – a closed one comes back into its home panel (a panel's link to another) */
  const openTab = (next: string) => floats.showTab(next);
  /**
   * Something was selected (a row of the tree, a pick on the stage): the Inspector shows it – the scene too (#229); not
   * in a panel showing the Tree, which shows the selection itself (#318: the Tree and the Inspector may share a panel)
   */
  const select = () => {
    const at = floats.holder("inspector");
    if (at && floats.showing("tree") === at) return;
    openTab("inspector");
  };
  const chooseTab = (next: string) => openTab(next);

  // ── the floating panels (#308, desktop and iPad): the stage is the whole window, the panels float over it ──
  /**
   * The scene workspace's panels (rem). The order is the order of growth: an earlier one leaves a later one the room it
   * asks for – the Tree and the Inspector (they scroll) grow to the full height beside the Scenes strip.
   */
  const SCENE_PANELS: PanelSpec[] = [
    { id: "tree", name: "Tree", icon: "tree", about: "The scene's surfaces, entries, their targets and the entities' nodes: a click selects, a drag moves a node.",
      place: at("top-left", 0, 0), size: { w: 16.5, h: "fill" }, min: { w: 12, h: 8 } },
    { id: "inspector", name: "Inspector", icon: "inspector", about: "Whatever is selected, and the tabs Environment, Library, Code, Log and Variables. It folds but never closes.",
      place: at("top-right", 0, 0), size: { w: 25, h: "fill" }, min: { w: 16, h: 10 }, essential: true },
    { id: "scenes", name: "Scenes", icon: "film", about: "The experience's scenes as a filmstrip: a card opens its scene, a band selects its group, a drag reorders.",
      place: at("bottom-left", 17, 0), size: { w: "fill", h: 12 }, min: { w: 20, h: 10 } },
    { id: "info", name: "Info", icon: "info", about: "The name and description of the control under the pointer or in focus.",
      place: at("bottom-left", 0, 0, { collapsed: true }), size: { w: 16.5, h: 10 }, min: { w: 12, h: 5 } },
    { id: "tools", name: "Tools", icon: "tool", about: "The stage's tools: select and its filters, move / rotate / scale, render quality, grid & snap, view and live.",
      place: at("top-left", 17, 0), size: { w: "content", h: "content" }, min: { w: 12, h: 2 }, essential: true, inline: true },
    { id: "history", name: "History", icon: "history", about: "Every saved change of the experience: filter by scene, kind or person; revert one, or jump back to a point (#312).",
      place: at("bottom-right", 0, 0, { closed: true }), size: { w: 28, h: 20 }, min: { w: 16, h: 8 } },
    { id: "logic", name: "Logic", icon: "nodes", about: "The experience's logic as a graph, one level at a time (#239, #334): the experience, a group, a scene, a target's entity – a click selects, a double-click opens a level.",
      place: at("bottom-right", 0, 0, { closed: true }), size: { w: 48, h: 24 }, min: { w: 18, h: 10 } },
  ];
  /**
   * The panels and their tabs (#318), remembered per workspace with the layout; a layout stored before #318 keeps its
   * closed panels and the tab the Inspector showed (`osct-editor-tab`, a Stage or Entity tab stored before #229 is the Inspector)
   */
  const floats = new Floats("scene", SCENE_PANELS, SCENE_TABS, tabOf(readStored(TAB_KEY)));
  // `?tab=` (the experience page links the Environment so) shows that tab
  untrack(() => {
    const asked = page.url.searchParams.get("tab");
    const tab = SCENE_TABS.some(t => t.id === asked) ? asked : tabOf(asked);
    if (tab) floats.showTab(tab);
    // `?logic=` (#334: the Logic panel's level, kept in the URL) shows the Logic panel
    if (page.url.searchParams.has("logic")) floats.showTab("logic");
  });
  /** The Environment tab shows: the stage previews it */
  const environmentShown = $derived(floats.showing("environment") !== null);
  /**
   * A box of the Logic panel picked (#239, #334): its entity's node in the tree and the Inspector, a plugin in the Code tab,
   * a group, the open scene (another scene's box opens only when entered)
   */
  const pickLogic = (pick: LogicPick) => {
    if (pick.kind === "plugin") {
      plugins.focus = pick.plugin;
      floats.showTab("code", true);
      return;
    }
    if (pick.kind === "group") return selectGroup(pick.group);
    if (pick.kind === "scene") {
      if (pick.scene === sceneId) selection.selectScene();
      return;
    }
    if (pick.kind === "experience") {
      // An experience rule's box: its rules are in the experience's Inspector
      floats.showTab("inspector", true);
      selection.selectExperience();
      return;
    }
    floats.showTab("inspector", true);
    selection.show({ target: pick.target, node: pick.path, onTarget: false });
    select();
  };
  // The Code tab asks for a wider panel (36rem) where it shows – until the person resizes the panel
  $effect(() => {
    const at = floats.showing("code");
    const h = at ? floats.spec(at)?.size.h : undefined;
    floats.asks = at && h !== undefined ? { [at]: { w: 36, h } } : {};
  });
  /** A form or a removal step opens in the Inspector tab: it shows, its folded panel opens for it */
  $effect(() => {
    if ((removal || addingTarget || addingEntry || addingScene)) untrack(() => floats.showTab("inspector", true));
  });

  // ── targets and entries: the forms, removal, a changed image or placement ──
  let addingTarget = $state(false);
  /** The tree's + menu's *entry…* (#237): an entry without a printed image on this scene */
  let addingEntry = $state(false);
  /** The creation step of a new scene (#238 – every experience adds scenes, #320): it follows `after` */
  let addingScene = $state<{ after: string | null } | null>(null);
  const openNewScene = (after: string | null) => {
    addingTarget = false;
    addingEntry = false;
    addingScene = { after };
  };
  const sceneCreated = async (newId: string) => {
    addingScene = null;
    await reloadContent();
    void goto(resolve(`${experienceId}/${newId}/`));
  };
  // The experience's scenes, read once per experience here – not only by the Scenes panel: the stage's reference images (#314) and
  // the scene removal come from them, with the panel closed too
  $effect(() => {
    const id = experienceId;
    if (untrack(() => scenes.experienceId) !== id) void scenes.load(id);
  });
  /** + after the last scene (#238) */
  const atLastScene = $derived(content.scenes.at(-1)?.id === sceneId);
  let entityPanel = $state<{ useAsset: (kind: MediaKind, src: string, assetId: string) => void }>();
  /** The content changed under the stage (a target's image or placement, a relink): reload it and build the scene again */
  const reloadContent = async () => {
    try {
      await content.load(experienceId);
      await stage?.refresh();
      void library.refresh();
      // The Scenes panel's counts (targets per scene)
      void scenes.load(experienceId);
    } catch (e) {
      failed(e);
    }
  };
  const targetCreated = async (targetId: string) => {
    addingTarget = false;
    await reloadContent();
    selection.selectTarget(targetId);
    openTab("inspector");
    // Its recognition frame, made by itself (#306) – never in the way of the new target
    recognitionFrames.autoFor(experienceId, targetId);
  };
  const entryCreated = async (entryId: string) => {
    addingEntry = false;
    await reloadContent();
    await entries.load(experienceId);
    selection.selectEntry(entryId, null);
    openTab("inspector");
  };
  /**
   * A removal waiting for the person's confirmation in the panel, with the API's impact and its warnings – an entry's
   * (#198) or a scene's (#319) – no browser dialog
   */
  let removal = $state<
    | { kind: "entry"; targetId: string | null; entryId: string; step: RemovalStep }
    | { kind: "scene"; sceneId: string; step: RemovalStep }
    | null
  >(null);
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
      await deleteEntry(experienceId, entryId);
    } catch (e) {
      const step = removalStep(e);
      if (!step) return failed(e);
      addingTarget = false;
      removal = { kind: "entry", targetId, entryId, step };
    }
  };
  /** A scene's removal asked for (the Inspector's scene section, a scene card's menu): first its impact, as an entry's */
  const removeScene = async (sceneId: string) => {
    removalError = null;
    try {
      await deleteScene(experienceId, sceneId);
    } catch (e) {
      const step = removalStep(e);
      if (!step) return failed(e);
      addingTarget = false;
      addingEntry = false;
      addingScene = null;
      removal = { kind: "scene", sceneId, step };
    }
  };
  let sceneAsksSeen = untrack(() => sceneRemoval.asked);
  $effect(() => {
    const asked = sceneRemoval.asked;
    if (asked === sceneAsksSeen) return;
    sceneAsksSeen = asked;
    const id = untrack(() => sceneRemoval.scene);
    if (id) void removeScene(id);
  });
  /** A scene removed: the open one gives way to its neighbour first, then the scenes and the draft are read again */
  const sceneRemoved = async (sceneId: string) => {
    removal = null;
    if (sceneId === sceneId) {
      const next = content.neighbour(sceneId, 1) ?? content.neighbour(sceneId, -1);
      if (next) await goto(resolve(`${experienceId}/${next.id}/`), { replace: true });
    }
    await scenes.load(experienceId, true);
    await reloadContent();
  };
  /** The second step: the same removal with the confirmation id; a void id brings the fresh impact */
  const confirmRemoval = async (deleteFiles: boolean) => {
    const asked = removal;
    if (!asked) return;
    removalBusy = true;
    removalError = null;
    try {
      if (asked.kind === "scene") {
        await deleteScene(experienceId, asked.sceneId, asked.step.confirmation.id, deleteFiles);
        await sceneRemoved(asked.sceneId);
      } else {
        await deleteEntry(experienceId, asked.entryId, asked.step.confirmation.id, deleteFiles);
        await removed(asked.targetId, asked.entryId);
      }
    } catch (e) {
      const step = removalStep(e);
      if (step) removal = { ...asked, step };
      else removalError = errorText(e);
    } finally {
      removalBusy = false;
    }
  };
  // ── the environment (#185): the experience's replaces the HDRI as the stage's sky (rendered); previewed while its tab is open
  // (its Library picker included) – in every shading, the default's world too ──
  $effect(() => {
    void environmentEdit.load(experienceId);
  });
  // An environment edit reached the draft: the content follows (nothing is built again – the stage shows the values
  // already), the Library counts the files' uses
  environmentEdit.onsaved = async id => {
    await content.load(id);
    void library.refresh();
  };
  // ── a scene's and the experience's rules and the variables (content schema 5.0, #334): an edit reached the draft – the
  // content follows, and the stage builds the open scene again (the engine reads a scene's and the experience's rules when
  // the scene opens) ──
  $effect(() => logicEdit.enter(experienceId));
  logicEdit.onsaved = async id => {
    if (id !== experienceId) return;
    await content.load(id);
    // Not awaited: the autosave's chain must not wait for the stage (a stage still building would hold every later save)
    void stage?.refresh().catch(() => {});
  };
  $effect(() => {
    const previewing = environmentShown;
    const environment = previewing ? environmentEdit.edited : stageEnvironment.current;
    stage?.showEnvironment(environment ? $state.snapshot(environment) : null, previewing);
  });
  $effect(() => {
    if (!environmentShown) environmentEdit.picking = null;
  });
  // ── surface reference images (#314): the scenes list has each surface's (`scenes.references`, read again whenever the
  // scenes change), handed to the stage, which lays them on the surfaces ──
  const surfaceReferences = $derived.by<SurfaceReferences>(() => {
    const refs: SurfaceReferences = {};
    if (scenes.experienceId !== experienceId) return refs;
    for (const [sceneId, surfaces] of Object.entries(scenes.references)) {
      for (const [surfaceId, reference] of Object.entries(surfaces)) (refs[sceneId] ??= {})[surfaceId] = { url: reference.url, fit: reference.fit };
    }
    return refs;
  });
  $effect(() => {
    stage?.setSurfaceReferences($state.snapshot(surfaceReferences));
  });

  // ── the surfaces' own grids (#316 part 1): the open scene's spacings, kept in this browser, go to the stage ──
  $effect(() => surfaceGrids.enter(experienceId, sceneId));

  // ── the Surface mode (#314): the Surface tool outlines the open scene's surfaces, a tap selects one (no target, no
  // node), Esc deselects; the selected one is highlighted with its gizmo, whose drag saves its place ──
  const surfaceMode = $derived(stage?.tool === "surface");
  const selectedSurface = $derived(selection.surface && selection.surface.scene === sceneId ? selection.surface.id : null);

  $effect(() => {
    const s = stage;
    if (!s) return;
    const own = (scenes.scene(sceneId)?.surfaces ?? []).map(surface => surface.id);
    // Outside the Surface mode a surface selected in the Tree or the Inspector is still highlighted
    s.setSurfaceMarks(surfaceMode ? own : [], selectedSurface);
    s.setSurfaceGizmo(surfaceMode ? selectedSurface : null, surfaceTool.gizmo);
  });
  const placeSurface = (surfaceId: string, place: Required<SurfacePlace>) => {
    const id = sceneId;
    const experience = experienceId;
    autosave.queue(`scene:${experience}:${id}:surfaces`, async () => {
      const surfaces = scenes.scene(id)?.surfaces ?? [];
      const next = updateSurface(surfaces, surfaceId, { place });
      if (!sameSurfaces(next, surfaces)) await scenes.putScene(id, { surfaces: next });
    });
  };

  // ── the Scenes panel (#307): the cards are the scenes' surfaces with their reference images; a change of the order,
  // a group or a new scene reaches the draft, so ‹ › and the stage follow ──
  let scenesSeen = untrack(() => scenes.version);
  $effect(() => {
    const version = scenes.version;
    if (version === scenesSeen) return;
    scenesSeen = version;
    // The open scene's surfaces may have changed (#314): the stage lays the scene out again from the new draft
    untrack(() => void content.load(experienceId).then(() => stage?.relayout()).catch(failed));
  });
  /** A card opens its scene; a scene just made is in the draft first */
  // The experience's address opens the scene last open here (the overview page is gone – Tilman, 2026-11-18)
  $effect(() => writeStoredJson(`osct-editor-last-scene:${experienceId}`, sceneId));
  const openScene = async (id: string) => {
    if (id === sceneId) return;
    try {
      if (!content.scene(id)) await content.load(experienceId);
    } catch (e) {
      return failed(e);
    }
    void goto(resolve(`${experienceId}/${id}/`));
  };
  const selectGroup = (id: string) => {
    selection.selectGroup(id);
    openTab("inspector");
  };
  /**
   * The Logic panel went to a level (#334, research §6.3): the workspace follows – a scene opens as from the Scenes panel,
   * an entity's node is selected (on its scene, opened first), a group or the experience is selected
   */
  const moveToLogic = (move: StageMove) => {
    switch (move.move) {
      case "experience": selection.selectExperience(); break;
      case "group": selection.selectGroup(move.group); break;
      case "scene":
        if (move.scene === sceneId) selection.selectScene();
        else void openScene(move.scene);
        break;
      case "node": {
        const state = { target: move.target, node: move.path, onTarget: false };
        if (move.scene === sceneId) selection.set(state);
        else {
          selection.requestOn(move.scene, state);
          void openScene(move.scene);
        }
      }
    }
  };

  // ── undo, redo and the History (#312): the experience's saved changes; a revert written reloads the draft, the stage
  // and the panels (their forms start again from the draft) ──
  $effect(() => history.enter(experienceId));
  let revisionSeen = untrack(() => history.revision);
  $effect(() => {
    const revision = history.revision;
    if (revision === revisionSeen) return;
    revisionSeen = revision;
    untrack(() => {
      void Promise.all([reloadContent(), entries.load(experienceId), environmentEdit.load(experienceId, true), scenes.load(experienceId, true)])
        .finally(() => (panelsRevision = revision));
    });
  });
  /** The panels start again from the draft once a revert's reload is in (their forms keep what was typed otherwise) */
  let panelsRevision = $state(untrack(() => history.revision));

  // ── autosave (#259): a target's live tree is an edit the draft does not hold yet – the Inspector's rows, a file for
  // a node, the tree's moves, a gizmo drag – and is saved by itself, whichever panel is open ──
  let queuedTrees: { stage: Stage; trees: Map<string, EntityData> } | null = null;
  $effect(() => {
    const s = stage;
    const experience = experienceId;
    if (!s) return;
    // Every change of the live trees runs this again
    void [...s.overrides];
    untrack(() => {
      if (queuedTrees?.stage !== s) queuedTrees = { stage: s, trees: new Map() };
      queueTreeSaves(s, experience, queuedTrees.trees);
    });
  });

  /** The library's Use: the selected node takes the file (the Inspector shows first – the Library tab replaced it) */
  const useAsset = async (asset: Asset) => {
    openTab("inspector");
    await tick();
    if (isMediaAsset(asset)) entityPanel?.useAsset(asset.kind, asset.url, asset.id);
  };
  const useAsTargetImage = async (asset: Asset) => {
    const targetId = selection.target;
    if (!targetId) return;
    try {
      await putTarget(experienceId, targetId, { imageSrc: asset.url });
    } catch (e) {
      return failed(e);
    }
    await reloadContent();
    recognitionFrames.autoFor(experienceId, targetId, asset.url);
  };
  /**
   * A Library tile dropped on a tree row (#330, `library-drag.svelte.ts` – it checked the fit): the row is selected and
   * takes the file the way the Inspector's *Use* does – a node its file, a target its printed image. The tree's action:
   * the Library only starts the drag.
   */
  const dropAsset = async (asset: Asset, row: DropRow) => {
    if (row.kind === "target") {
      selection.show({ target: row.targetId, node: [], onTarget: true });
      await useAsTargetImage(asset);
      return;
    }
    if (row.kind !== "node") return;
    selection.show({ target: row.targetId, node: row.path, onTarget: false });
    await tick();
    await useAsset(asset);
  };
  $effect(() => {
    libraryDrag.ondrop = dropAsset;
    return () => {
      if (libraryDrag.ondrop === dropAsset) libraryDrag.ondrop = null;
    };
  });
  /**
   * Ctrl / ⌘ + L (#330): the Library tab – shown where it lives (#318: a closed one comes back into its home panel, a
   * folded panel opens for it) and its search focused; a second press while the search has the focus shows the
   * Inspector again. The panels' API is used in this one function only.
   */
  const toggleLibrary = async () => {
    const search = () =>
      document.querySelector<HTMLInputElement>("[data-library-search='browser']") ?? document.querySelector<HTMLInputElement>("[data-library-search='panel']");
    if (floats.showing("library") && document.activeElement && document.activeElement === search()) {
      floats.showTab("inspector", true);
      return;
    }
    floats.showTab("library", true);
    await tick();
    search()?.focus();
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
      if (content.experienceId !== experienceId) {
        const error = await content.load(experienceId);
        if (error) {
          loadError = `${error.msg}${error.details?.[0] ? ` – ${error.details[0]}` : ""}`;
          return;
        }
      }
      if (disposed || !container) return;
      if (!stage) {
        // The saved sources' ids before the stage starts: their compiled declarations are not loaded on the stage
        if (plugins.experienceId !== experienceId) await plugins.load(experienceId).catch(() => undefined);
        // The guard (#340): the stage runs plugin code in this page, with the person's session – code someone else saved
        // last runs only after the prompt says so; what it keeps off is said in the Code tab and the Log tab. The render view
        // (#89, nobody to ask) runs only what the person answered Run for before
        const declined = await pluginGuard.check(experienceId, plugins.stored, plugins.declared(), session.user?.email ?? null, { ask: !render });
        plugins.declined.clear();
        declined.forEach((why, id) => {
          plugins.declined.set(id, why);
          plugins.addLog({ level: "warn", text: `[plugin ${id}] not run: ${why}`, t: performance.now() });
        });
        if (disposed || !container || stage) return;
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
        // The Surface mode (#314): a tap selects the scene's surface there; on none the scene
        stage.onSurfacePick = hit => {
          if (stage?.tool !== "surface") return;
          stageMenu = null;
          const own = hit && scenes.scene(sceneId)?.surfaces?.some(surface => surface.id === hit.surfaceId);
          if (!hit || !own) {
            selection.clear();
            return;
          }
          selection.selectSurface(sceneId, hit.surfaceId);
          select();
        };
        stage.onSurfacePlace = placeSurface;
        // The Code tab's saved sources run when the stage starts (#269): their looks and components are known at once
        const started = stage;
        // before the first scene builds, so its nodes find what the code registers (#340)
        started.onStarted = () => plugins.autoLoad(experienceId, started, { refresh: false });
        // Their content modules never load: a saved source runs instead, a declined plugin not at all (#340)
        started.keptPlugins = () => [...plugins.stored.map(p => p.id), ...plugins.declined.keys()];
      }
      await stage.open(sceneId);
    } catch (e) {
      loadError = errorText(e);
    }
  };

  $effect(() => {
    if (!render) return;
    const error = loadError ?? actionError ?? (stage?.status === "error" ? (stage.error ?? "The stage failed.") : null);
    markRender(renderState(stage?.status, error), error);
  });

  onMount(() => {
    disposed = false;
    void start();
    return () => {
      disposed = true;
      pluginGuard.dismiss();
      void stage?.dispose();
      stage = null;
    };
  });

  // The route's scene changed (‹ › or the URL): the stage follows
  $effect(() => {
    const id = sceneId;
    if (stage && stage.sceneId !== id) stage.open(id).catch(failed);
  });
  // …and the selection: another scene starts with itself selected (#229), not with a target it does not have
  let selectedOn = untrack(() => sceneId);
  $effect(() => {
    const id = sceneId;
    if (id === selectedOn) return;
    selectedOn = id;
    selection.enter(id);
  });
  // The search or the experience's ⚙ asked to show the selection: the Inspector opens
  $effect(() => {
    const asked = selection.reveal;
    if (asked === revealSeen) return;
    revealSeen = asked;
    untrack(() => {
      addingTarget = false;
      addingEntry = false;
      addingScene = null;
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
  const TOOL_NAMES: Record<StageTool, string> = { select: "Select", translate: "Move", rotate: "Rotate", scale: "Scale", surface: "Surface" };
  const TOOL_ICONS: Record<StageTool, IconName> = { select: "pointer", translate: "move", rotate: "rotate", scale: "scale", surface: "surface" };
  /** Q / W / E / R / S, from the tools' own keys */
  const toolKey = (tool: StageTool) => Object.entries(TOOL_KEYS).find(([, t]) => t === tool)?.[0].toUpperCase();
  const toolLabel = (tool: StageTool) =>
    tool === "select" ? `Select (${toolKey(tool)}) – a click picks what the filters allow, no gizmo`
      : tool === "surface" ? `Surface (${toolKey(tool)}) – the scene's surfaces outlined, a click selects one, Esc deselects; the selected one moves with its gizmo`
        : `${TOOL_NAMES[tool]} (${toolKey(tool)}) – Shift or Ctrl turns snapping around`;
  const TOOL_OPTIONS: ToolGroupOption[] = STAGE_TOOLS.map(tool => ({ value: tool, name: TOOL_NAMES[tool], key: toolKey(tool), icon: TOOL_ICONS[tool], label: toolLabel(tool) }));
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
  /** With the experience's environment, *rendered* shows its world instead of the HDRI (#185) – the button's label says so */
  const shadingOptions = $derived<ToolGroupOption[]>(stageEnvironment.current
    ? SHADING_OPTIONS.map(option => (option.value === "rendered" ? { ...option, label: "Rendered – the environment's sky, the reader's light" } : option))
    : SHADING_OPTIONS);
  /** The groups' shapes in the toolbar's order (render quality, grid & snap and view are one button each) */
  const TOOL_SHAPES: GroupShape[] = [{ options: TOOL_OPTIONS.length }, { options: FILTER_OPTIONS.length }, { options: 1 }, { options: 1 }, { options: 1 }];
  /** The view group: the stage's menu opens it (*View settings…*) */
  let viewMenu = $state<{ open: () => void }>();

  // ── the camera (#335): Home, Focus on the selection (nothing: the whole scene), the point fixed to a surface or free ──
  let cameraOrbit = $state<PreviewOrbit | null>(getPreview().orbit);
  onMount(() => subscribePreview(state => (cameraOrbit = state.orbit)));
  const cameraFree = $derived(!!cameraOrbit?.free);
  /** What the stage's corner says the camera turns around: a focused thing, free – nothing at Home */
  const cameraCorner = $derived(cameraOrbit?.free ? "Free camera" : (cameraOrbit?.label ?? null));
  /** Focus on what is selected on this scene's stage: a surface, a node, a target – else the whole scene */
  const focusSelection = () => {
    if (!stage) return;
    const surface = selection.surface && selection.surface.scene === sceneId ? selection.surface.id : undefined;
    if (surface) {
      const label = content.scene(sceneId)?.surfaces?.find(s => s.id === surface)?.label || surface;
      stage.focusCamera({ surface, label });
    } else if (selection.target && !selection.onTarget) {
      const label = selection.node.length ? `${selection.target} › ${selection.node.join(" › ")}` : selection.target;
      stage.focusCamera({ node: { targetId: selection.target, path: [...selection.node] }, target: selection.target, label });
    } else if (selection.target) {
      stage.focusCamera({ target: selection.target, label: selection.target });
    } else {
      stage.focusCamera({});
    }
  };

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
  /**
   * "Use for the landing page" (#355): the target becomes the desktop landing's hero – its hero extracted from the draft
   * (after the edits waiting before it) and stored in the experience, saved like any edit (RULES #37); History shows it
   */
  const useForLanding = (targetId: string) => {
    stageMenu = null;
    const id = experienceId;
    const pick = { scene: sceneId, target: targetId };
    autosave.queue(`experience:${id}:landing`, async () => {
      const result = await extractLanding(id, pick);
      if ("problem" in result) throw new Error(`Landing page: ${result.problem}`);
      await putExperience(id, { landing: result.landing });
    });
  };
  const NAVIGATION_HELP = "Drag = orbit · Shift-drag, the middle button or two fingers = pan · wheel / pinch = distance · F = focus on the selection · Home or double tap = the reader's view · ← → = the scenes. A click picks what lies there, right click opens its menu.";

  const scene = $derived(content.scene(sceneId));

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
    if (JSON.stringify(metrics) !== JSON.stringify(untrack(() => toolMetrics))) toolMetrics = metrics;
    // The Tools panel's room: the width it was resized to, else the room between the Tree and the Inspector
    // Less the groups that never fold: undo / redo / history (3 buttons, #312), the camera (3, #335) and Live (2), each with its rule
    const fixed = 8 * button + 5 * metrics.gap + 3 * (metrics.gap + metrics.rule);
    const room = floatingRoom(rem) - ROOM_SLACK - fixed;
    // A column (#315): every group one button and its menu – side by side its options would make it wide
    const next = floats.vertical("tools") ? TOOL_SHAPES.map(() => false) : expandedGroups(TOOL_SHAPES, room, metrics);
    if (next.some((e, i) => e !== expanded[i])) expanded = next;
  });

  // ── the toolbar's overflow (#342, Tilman 2026-11-22): the groups that do not fit the Tools panel – along its row or
  // its column – go behind a … at its end, whose menu holds them, each working as in the row. The panel asks for the
  // toolbar's whole length (every group in it, `along`), so the room it is given never depends on what is hidden: each
  // group's length is measured where it last stood in the toolbar (an estimate from its buttons before that), the room
  // is the panel's laid-out size less its chrome, and `fittingGroups` decides – no loop, no flicker ──
  /** The toolbar's groups in order: undo / redo / history, the tool, the select filters, render quality, grid & snap, view, camera, live */
  const GROUP_COUNT = 8;
  const CAMERA_GROUP = 6;
  const VIEW_GROUP = 5;
  let toolMetrics = $state<ToolbarMetrics>({ button: 28, gap: 2, rule: 7, chrome: 6 });
  /** Each group's buttons, for its estimate (the tool and the filters side by side when expanded) */
  const groupButtons = (i: number) => [3, expanded[0] ? TOOL_OPTIONS.length : 1, expanded[1] ? FILTER_OPTIONS.length : 1, 1, 1, 1, 3, 2][i];
  /** A measured length's key: a group's length depends on the orientation, a finger's button size and its expansion */
  const lengthKey = (part: number | "more" | "end") => {
    const at = `${floats.vertical("tools") ? "v" : "h"}${coarse ? "c" : "f"}`;
    return typeof part === "number" ? `${at}${part}${(part === 1 && expanded[0]) || (part === 2 && expanded[1]) ? "x" : ""}` : `${at}${part}`;
  };
  /** The lengths measured along the toolbar (px), by `lengthKey` */
  let lengths = $state<Record<string, number>>({});
  const groupLengths = $derived(Array.from({ length: GROUP_COUNT }, (_, i) => lengths[lengthKey(i)] ?? groupLength(groupButtons(i), i === 0, toolMetrics)));
  const moreLength = $derived(lengths[lengthKey("more")] ?? groupLength(1, false, toolMetrics));
  const toolbarEnd = $derived(lengths[lengthKey("end")] ?? toolMetrics.chrome / 2);
  /** The toolbar's length with every group in it: what the Tools panel asks for */
  const toolbarAlong = $derived(groupLengths.reduce((sum, length) => sum + length, 0) + toolbarEnd);
  /** The room along the toolbar (px): the Tools panel as laid out, less its grip and its button */
  const toolbarRoom = $derived.by(() => {
    const view = floats.views.tools;
    const spec = floats.spec("tools");
    if (!view || !spec) return Infinity;
    const vertical = floats.vertical("tools");
    const chrome = chromeOf(spec, floats.metrics, vertical);
    return vertical ? view.rect.h - chrome.h : view.rect.w - chrome.w;
  });
  /** How many groups stay in the toolbar (a px of tolerance against subpixel rounding: the panel is as long as the toolbar) */
  const toolbarFit = $derived(fittingGroups(groupLengths, toolbarRoom - toolbarEnd + 1, moreLength));
  const shownGroups = $derived(Array.from({ length: toolbarFit }, (_, i) => i));
  const hiddenGroups = $derived(Array.from({ length: GROUP_COUNT - toolbarFit }, (_, i) => toolbarFit + i));
  // Measure every part of the toolbar where it stands: a part's length runs from the end of the one before
  $effect(() => {
    const bar = tools;
    if (!bar) return;
    const measure = () => {
      const vertical = bar.getAttribute("aria-orientation") === "vertical";
      const box = bar.getBoundingClientRect();
      if (!box.width || !box.height) return;
      let end = vertical ? box.top : box.left;
      const next = { ...untrack(() => lengths) };
      let changed = false;
      const put = (key: string | undefined, length: number) => {
        if (!key || Math.abs((next[key] ?? -1) - length) <= 0.5) return;
        next[key] = length;
        changed = true;
      };
      bar.querySelectorAll<HTMLElement>(":scope > .part").forEach((part, i) => {
        const r = part.getBoundingClientRect();
        const to = vertical ? r.bottom : r.right;
        // The … alone (nothing fits beside it) has no rule before it: its length with the rule is the one that counts
        if (i > 0 || part.dataset.length !== lengthKey("more")) put(part.dataset.length, to - end);
        end = to;
      });
      put(bar.dataset.end, (vertical ? box.bottom : box.right) - end);
      if (changed) lengths = next;
    };
    // Measured in the next frame – never in the same task, so nothing could ever hold the page in a loop
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(later);
    const watch = () => {
      observer.observe(bar);
      for (const part of bar.querySelectorAll(":scope > .part")) observer.observe(part);
    };
    // Groups come and go (the …'s menu takes them, a group's options expand): watch the new ones
    const parts = new MutationObserver(() => {
      watch();
      later();
    });
    watch();
    parts.observe(bar, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      parts.disconnect();
    };
  });
  let moreButton = $state<HTMLButtonElement>();
  let morePop = $state<HTMLDivElement>();
  let moreOpen = $state(false);
  let moreAt = $state({ left: 0, top: 0 });
  /** The …'s menu at its button: below it in a row, beside it in a column – kept on the screen (`menuPlace`) */
  const placeMore = () => {
    if (!moreButton || !morePop) return;
    moreAt = menuPlace(moreButton.getBoundingClientRect(), { width: morePop.offsetWidth, height: morePop.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }, floats.vertical("tools"));
  };
  let moreWidthAtOpen = 0;
  const moreToggle = (event: Event) => {
    moreOpen = (event as ToggleEvent).newState === "open";
    moreWidthAtOpen = window.innerWidth;
    if (moreOpen) placeMore();
  };
  /** A window that changes its width moves the toolbar: the menu closes, as the groups' own menus do */
  const moreResize = () => {
    if (moreOpen && closesOnResize(moreWidthAtOpen, window.innerWidth)) morePop?.hidePopover();
  };
  // Everything fits again: the menu has nothing left to hold
  $effect(() => {
    if (toolbarFit === GROUP_COUNT) moreOpen = false;
  });
  /** The stage's menu *View settings…*: the view group's panel – from the …'s menu when the group is in there */
  const openViewSettings = async () => {
    if (toolbarFit <= VIEW_GROUP && morePop && !morePop.matches(":popover-open")) {
      morePop.showPopover();
      moreOpen = true;
      placeMore();
      await tick();
    }
    viewMenu?.open();
  };

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
    const next = content.neighbour(sceneId, direction);
    if (next) void goto(resolve(`${experienceId}/${next.id}/`), { replace: true });
  };
  /** Shift or Ctrl held turns snapping around while dragging (#190) */
  const snapKey = (event: KeyboardEvent) => stage?.setSnapModifier(event.shiftKey || event.ctrlKey);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Shift" || event.key === "Control") snapKey(event);
    // Ctrl / ⌘ + L, in a field too: the Library and its search (#330)
    if ((event.key === "l" || event.key === "L") && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      void toggleLibrary();
      return;
    }
    // A key sent to the window or the document (no element – a plugin may dispatch one) is the page's too
    if (event.target instanceof Element && event.target.closest("input, textarea, select")) return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (tool && !event.ctrlKey && !event.metaKey && !event.altKey) stage?.setTool(tool);
    // The camera (#335): F focuses on the selection, Home goes back to the reader's view
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "f" || event.key === "F") focusSelection();
      if (event.key === "Home") { event.preventDefault(); stage?.cameraHome(); }
    }
    // Esc deselects a selected surface (#314, the Surface mode): the scene is selected again
    if (event.key === "Escape" && selection.surface && !picking) selection.clear();
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

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} onresize={moreResize} onblur={() => stage?.setSnapModifier(false)} />


{#snippet toolGroup(i: number)}
  {#if stage}
    {#if i === 0}
      <UndoRedo onhistory={() => floats.showTab("history", true)} />
    {:else if i === 1}
      <ToolGroup label="Tool" options={TOOL_OPTIONS} value={stage.tool} expanded={expanded[0]}
        onchoose={tool => stage?.setTool(tool as StageTool)} />
    {:else if i === 2}
      <span class="tool-group filters" data-help-name="Select filters" data-help={FILTER_HELP}>
        <ToolGroup label="Select filters" options={FILTER_OPTIONS} selected={stage.pickFilter} icon="pointer" expanded={expanded[1]}
          onchoose={kind => stage?.setPickFilter(toggleKind(stage.pickFilter, kind as PickKind))} />
      </span>
    {:else if i === 3}
      <ToolGroup label="Render quality" options={shadingOptions} value={stage.shading} stroke={1.75}
        onchoose={mode => updatePreview({ shading: mode as ShadingMode })} />
    {:else if i === 4}
      <GridSnapMenu />
    {:else if i === VIEW_GROUP}
      <ViewMenu bind:this={viewMenu} />
    {:else if i === CAMERA_GROUP}
      <!-- #335: the camera – Home, Focus on the selection, the point it turns around fixed to a surface or free -->
      <span class="tool-group camera" role="group" aria-label="Camera">
        <button type="button" class="icon-button" onclick={() => stage?.cameraHome()} aria-label="Home" title="Home (Home key, double click): the reader's view around the scene's origin"
          data-help-name="Home" data-help="Back to the start view: the reader's view, turning around the scene's origin on the table. The Home key and a double click on the stage do the same.">
          <Icon name="home" /></button>
        <button type="button" class="icon-button" onclick={focusSelection} aria-label="Focus" title="Focus (F): turn around the selection – a surface, a target, a node; nothing selected: the whole scene"
          data-help-name="Focus" data-help="The camera faces the selection and turns around its middle: a surface (a standing poster, a wall) front-on and whole, a printed target, a node of an entity. With nothing selected it shows the whole scene. A pan then slides along that surface.">
          <Icon name="crosshair" /></button>
        <button type="button" class="icon-button" class:on={cameraFree} aria-pressed={cameraFree} onclick={() => stage?.cameraFree(!cameraFree)}
          aria-label={cameraFree ? "Camera: free" : "Camera: fixed"} title={cameraFree ? "Free: a pan moves the camera's point along the screen, anywhere – click to fix it to its surface again" : "Fixed: a pan slides the camera's point along its surface – click to free it"}
          data-help-name="Fixed / free" data-help="Fixed: the point the camera turns around stays on its surface (the table, or the surface you focused) and a pan slides it along. Free: a pan moves it along the screen – up, down, anywhere in the room. Back to fixed, it lands on the surface along your line of sight, so the view does not jump.">
          <Icon name={cameraFree ? "unlock" : "lock"} /></button>
      </span>
    {:else}
      <!-- #269: the stage runs the experience live (Unreal's Realtime) – Live off holds the entities' clock for placing; Restart is a new game -->
      <span class="tool-group live" role="group" aria-label="Live">
        <button type="button" class="icon-button" class:on={stage.live} aria-pressed={stage.live} onclick={() => stage?.setLive(!stage.live)}
          aria-label={stage.live ? "Live: on" : "Live: off"} title={stage.live ? "Live: the scene moves by itself – click to hold it still for placing" : "Held: the scene stands still – click to let it move again"}
          data-help-name="Live" data-help="On: the stage plays the experience as a reader sees it – components, clips, the experience's code move by themselves. Off: their clock holds, so the scene stands still while you place things; what is found still appears. The code is loaded either way.">
          <Icon name={stage.live ? "pause" : "play"} /></button>
        <button type="button" class="icon-button" onclick={() => stage?.resetNarrative()} aria-label="Restart" title="Restart: a new game – nothing found, no variables; every reveal plays again"
          data-help-name="Restart" data-help="A new game on the stage: nothing found, every variable cleared, the timeline empty – the scene's targets are found anew and play their reveal, as a reader meets the scene the first time.">
          <Icon name="replay" /></button>
      </span>
    {/if}
  {/if}
{/snippet}

{#snippet stageView()}
  <!-- The stage's own layers over the engine: its menus, the subtitle, the notices and the colour picker -->
  {#if stage && stage.status === "running"}
    {#if stageMenu?.hit}
      {@const hit = stageMenu.hit}
      {@const hasTree = !!stage.treeOf(hit.targetId)}
      <ContextMenu at={stageMenu} label="Target" head="{hit.targetId}{hit.path.length ? ` › ${hit.path.join(' › ')}` : ''}" onclose={() => (stageMenu = null)} items={[
        { label: hasTree ? "Add node…" : "Add AR content…", select: menuAddNode },
        ...(hasTree ? [{ label: hit.path.length ? "Remove node" : "Remove entity", select: menuRemoveNode }] : []),
        { label: "Placement on the surface…", select: menuPlacement },
        { label: "Replay the first find", select: () => stage?.replayUnlock() },
        { label: "Use for the landing page", disabled: landingContentProblem(stage.treeOf(hit.targetId)), select: () => useForLanding(hit.targetId),
          help: "The desktop landing's hero shows this target's AR content (a model, a video, a component) on its print, on this scene's surface: its picture, the entity and the experience's looks are taken from the draft now and stored in the experience – publish writes them into the version's landing.json. The experience's Inspector (⚙) shows the pick, refreshes it and removes it." },
        { label: "Library…", select: () => chooseTab("library") },
        { label: "Remove target", danger: true, select: () => { const t = content.scene(sceneId)?.targets.find(x => x.id === hit.targetId); if (t) void removeEntry(t.entryId, t.id); } },
      ]} />
    {:else if stageMenu}
      <ContextMenu at={stageMenu} label="Stage" head={scene ? sceneLabel(scene) : sceneId} onclose={() => (stageMenu = null)} items={[
        { label: "+ target…", select: () => (addingTarget = true) },
        { label: "Replay the first find", select: () => stage?.replayUnlock() },
        { label: "View settings…", select: () => void openViewSettings() },
      ]} />
    {/if}
  {/if}
  {#if stage && stage.status === "running" && cameraCorner}
    <p class="camera-corner" data-app-ui>
      <Icon name={cameraFree ? "unlock" : "crosshair"} /> <span class="what">{cameraCorner}</span>
      <button type="button" class="icon-button" aria-label="Home" title="Home: the reader's view around the scene's origin" onclick={() => stage?.cameraHome()}><Icon name="close" /></button>
    </p>
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
{/snippet}

{#snippet toolbar()}
  {#if stage}
    <!-- The tool in hand and the select filters, render quality, then grid & snap and view, one button and its panel each;
         always one row (#180, #190, #229, #308) or one column (#315) – what does not fit goes behind the … (#342) -->
    <div class="tools" class:vertical={floats.vertical("tools")} role="toolbar" aria-orientation={floats.vertical("tools") ? "vertical" : "horizontal"}
      data-app-ui aria-label="Stage tools" data-end={lengthKey("end")} bind:this={tools}>
      {#each shownGroups as i (i)}
        <span class="part" data-length={lengthKey(i)}>{@render toolGroup(i)}</span>
      {/each}
      {#if hiddenGroups.length}
        <span class="part" data-length={lengthKey("more")}>
          <button bind:this={moreButton} type="button" class="icon-button more-button" class:open={moreOpen} popovertarget="stage-tools-more"
            aria-label="More tools" aria-haspopup="true" aria-expanded={moreOpen} title="More tools: the ones the toolbar has no room for"
            data-help-name="More tools" data-help="The tools the toolbar has no room for, in a menu – each works as in the toolbar. Make the Tools panel longer (or the window wider) and they come back into it; their keys work either way.">
            <Icon name="more" /></button>
        </span>
        <!-- The …'s menu (top layer): the hidden groups below each other, each as in the row; their own menus open beside it -->
        <div bind:this={morePop} id="stage-tools-more" class="more-pop" popover="auto" role="toolbar" aria-orientation="vertical" aria-label="More tools"
          data-app-ui ontoggle={moreToggle} style:left="{moreAt.left}px" style:top="{moreAt.top}px">
          {#each hiddenGroups as i (i)}
            <span class="part">{@render toolGroup(i)}</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet sceneExtra(active: string)}
  <!-- The Inspector's +: on the last scene, the creation step of a new scene (#238) -->
  {#if active === "inspector" && atLastScene}
    <button type="button" class="icon-button" onclick={() => openNewScene(sceneId)} title="Add a scene after the last one" aria-label="Add a scene"
      data-help-name="Add a scene" data-help="Opens the creation step for a new scene after this one – a double page, a single page or a wall."><Icon name="plus" /></button>
  {/if}
{/snippet}

{#snippet tabBody(t: string)}
  <!-- A tab's content (#318), in whatever panel holds it -->
  {#if t === "tree"}
    <div class="float-body"><div class="body tree-body">{@render treeBody()}</div></div>
  {:else if t === "scenes"}
    <ScenesPanel {experienceId} experienceTitle={scenes.tree?.experience.title ?? ""} current={sceneId} selectedGroup={selection.group} floating
      assetsBase={content.assetsBase ?? ""} onopen={id => void openScene(id)} onselectgroup={selectGroup} onstep={step} />
  {:else if t === "info"}
    <InfoView floating />
  {:else if t === "history"}
    <HistoryPanel current={sceneId} />
  {:else if t === "logic"}
    <LogicPanel {experienceId} {sceneId} {stage} onpick={pickLogic} onmove={moveToLogic} />
  {:else}
    <!-- A revert written (#312): the forms start again from the draft -->
    <div class="float-body inspector">{#key panelsRevision}{@render panelTabs(t)}{/key}</div>
  {/if}
{/snippet}

{#snippet treeBody()}
  <TreePanel {stage} {sceneId} onselect={select} onaddtarget={() => { addingEntry = false; addingTarget = true; }}
    onaddentry={() => { addingTarget = false; addingScene = null; addingEntry = true; }}
    onaddscene={openNewScene} onremoveentry={removeEntry} ontargetchanged={reloadContent} />
{/snippet}

{#snippet panelTabs(shown: string)}
  {#if shown === "inspector" && removal}
    <div class="body removal"><RemovalConfirm step={removal.step} busy={removalBusy} error={removalError} onconfirm={deleteFiles => void confirmRemoval(deleteFiles)} oncancel={() => (removal = null)} /></div>
  {:else if shown === "inspector" && addingTarget && scene}
    <div class="body"><NewTargetForm {experienceId} {scene} {stage} oncreated={targetCreated} oncancel={() => (addingTarget = false)} /></div>
  {:else if shown === "inspector" && addingScene}
    <div class="body"><NewSceneForm {experienceId} scenes={content.scenes} after={addingScene.after} oncreated={sceneCreated} oncancel={() => (addingScene = null)} /></div>
  {:else if shown === "inspector" && addingEntry && scene}
    <div class="body"><NewEntryForm {experienceId} {scene} oncreated={entryCreated} oncancel={() => (addingEntry = false)} /></div>
  {:else if shown === "inspector"}
    <div class="body"><EntityPanel bind:this={entityPanel} {stage} {experienceId} {sceneId} selected={selection.target} bind:node={selection.node} {pickColour} ontargetchanged={reloadContent} oncode={() => openTab("code")} ontab={openTab} /></div>
  {:else if shown === "environment"}
    <div class="body"><EnvironmentPanel {stage} {experienceId} /></div>
  {:else if shown === "library"}
    <div class="body"><LibraryPanel {experienceId} nodeType={selectedNodeType} targetId={selection.target} onuse={useAsset} onusetarget={useAsTargetImage} onchanged={reloadContent} onopencode={() => openTab("code")} /></div>
  {:else if shown === "code"}
    <div class="body code"><CodePanel {experienceId} {stage} /></div>
  {:else if shown === "log"}
    <div class="body"><LogPanel {stage} {experienceId} {sceneId} onopenscene={id => void openScene(id)} ontab={tab => floats.showTab(tab, true)} /></div>
  {:else if shown === "variables"}
    <div class="body"><StageVariables {stage} /></div>
  {/if}
{/snippet}

<Workspace {floats} alone={!!render} bind:stageElement={container} bind:coarse help={{ name: "Stage", text: NAVIGATION_HELP }}
  stage={render ? undefined : stageView} tab={tabBody} extra={sceneExtra}>
  {#if stage && stage.status === "running"}
    <FloatingPanel {floats} id="tools" label="Stage tools" along={toolbarAlong}>{@render toolbar()}</FloatingPanel>
  {/if}
  <RevertPrompt />
  <PluginGuardPrompt />
</Workspace>

<style>
  :global(.workspace.holding > .stage .stage-host) { pointer-events: none; }
  .float-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .float-body.inspector { min-width: 0; }
  /* The toolbar in its floating panel: one row; the page computes the groups' widths from these sizes */
  .tools { display: flex; flex-wrap: nowrap; align-items: center; gap: .125rem; width: max-content; color: var(--text); }
  /* A column (#315): the groups below each other, a rule above each instead of beside it */
  .tools.vertical { flex-direction: column; align-items: center; width: auto; }
  /* Each group in its part (the toolbar measures the parts, #342); a rule before each after the first */
  .part { flex: none; display: flex; align-items: center; }
  .tools > .part + .part { margin-left: .125rem; padding-left: .25rem; border-left: 1px solid var(--line); }
  .tools.vertical > .part { flex-direction: column; }
  .tools.vertical > .part + .part { margin: .125rem 0 0; padding: .25rem 0 0; border-left: 0; border-top: 1px solid var(--line); }
  /* Every group stacks in a column – undo / redo / history and Live too, so the column stays one button wide */
  .tools.vertical > .part :global(.tool-group) { flex-direction: column; align-items: center; }
  .more-button.open { background: var(--pressed-background); color: var(--pressed-color); }
  /* The …'s menu (#342): the hidden groups below each other, each a row as in the toolbar, a rule between them */
  .more-pop { position: fixed; inset: auto; margin: 0; padding: .25rem; display: none; flex-direction: column; align-items: stretch;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); }
  .more-pop:popover-open { display: flex; }
  .more-pop > .part + .part { margin-top: .125rem; padding-top: .25rem; border-top: 1px solid var(--line); }
  .live, .filters { display: flex; gap: .125rem; }
  .live .on { color: var(--accent, currentColor); }
  .tree-body { padding: .25rem .375rem .75rem; }
  /* The stage's layer (#340: in this page, no frame) under the toolbar and the notices; a panel drag over it stays the page's */
  :global(.workspace > .stage .stage-host) { position: absolute; inset: 0; overflow: hidden; }
  :global(.workspace > .stage .stage-host canvas) { display: block; }
  .subtitle { position: absolute; left: 50%; bottom: 3rem; transform: translateX(-50%); z-index: 1; margin: 0; max-width: min(34rem, calc(100% - 2rem)); padding: .25rem .75rem; border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); text-align: center; white-space: pre-line; pointer-events: none; }
  /* #335: what the camera turns around, bottom right of the stage – the docked panels' tabs keep the left (Home clears it) */
  .camera-corner { position: absolute; right: .75rem; bottom: .75rem; z-index: 1; margin: 0; display: flex; align-items: center; gap: .375rem; max-width: calc(100% - 1.5rem);
    padding: 0 0 0 .5rem; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: .8125rem; }
  .camera-corner .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .notice { position: absolute; left: 50%; top: 1rem; transform: translateX(-50%); margin: 0; padding: .25rem .75rem; border-radius: var(--control-radius); background: var(--surface); }
  .picker { position: absolute; inset: 0; z-index: 2; cursor: crosshair; outline: none; touch-action: none; }
  .pick-chip { position: absolute; pointer-events: none; display: inline-flex; align-items: center; gap: .375rem; height: var(--control-height); padding: 0 .5rem;
    border: 1px solid var(--line); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: var(--text-small); font-family: ui-monospace, Consolas, monospace; }
  .pick-chip::before { content: ""; width: .875rem; height: .875rem; border-radius: 50%; border: 1px solid var(--line); background: var(--c); }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: .375rem .5rem .75rem; display: flex; flex-direction: column; gap: .125rem; container: panel / inline-size; }
  .body.code { overflow: hidden; }
  .icon-button { text-decoration: none; }
</style>
