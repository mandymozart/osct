<script lang="ts">
  import { untrack } from "svelte";
  import { autosave } from "#lib/autosave.svelte.js";
  import { baselineOf, differsFromBaseline } from "#lib/baselines.js";
  import { treeContent, treeKey } from "#lib/tree-autosave.js";
  import { getAssets, getEntityRef, getTargetsUsingEntity } from "@engine/content/game-config";
  import {
    BEHAVIOUR_TYPE, ENTITY_TYPES, FILTER_TYPES, isTargetEnabled, materialSpec, materialTypesFor, nodeTypeSpec, pluginNodeTypes, type AssetData, type EntityData, type FilterType,
    type NodeType, type Target,
  } from "@engine/types";
  import { errorText, isMediaAsset, putTarget, type Asset, type TargetPlace } from "#lib/api.js";
  import { content } from "#lib/content.svelte.js";
  import { library } from "#lib/library.svelte.js";
  import { recognitionFrames, frameTargetOf } from "#lib/recognition-frames.svelte.js";
  import { nodeAssetKinds, pickAccept, type LibraryPick } from "#lib/library-pick.js";
  import { fileNameOf } from "#lib/library-place.js";
  import { plugins } from "#lib/plugins.svelte.js";
  import { Stage } from "#lib/stage/stage.svelte.js";
  import { flatFrame, fromOrigin, toOrigin } from "#lib/stage/origin.js";
  import { withWidth } from "#lib/stage/placement.js";
  import { getPreview, subscribePreview } from "#lib/stage/preview.js";
  import {
    addComponent, addFilter, componentTypesFor, getValue, hasUniformScale, newNode, nodeAt, removeComponent, removeFilter,
    helpName, sameValue, setMaterial, setValue, valueRows, withNode, type ValueRow,
  } from "#lib/values.js";
  import { MakeCodeError, materialCode, nodeTypeCode, nodeTypeOwner, takesMaterial, type MadeCode } from "#lib/plugins/make-code.js";
  import { selection } from "#lib/selection.svelte.js";
  import { scenes } from "#lib/scenes.svelte.js";
  import { choiceOf, moveToSurface, placeOnChoice, surfaceChoices } from "#lib/surface-edit.js";
  import { breadcrumb } from "#lib/selection.js";
  import { ADD_PLACES, addNode, defaultAddPlace, nodeLabel, typeLabel, withName, type AddPlace } from "#lib/tree.js";
  import type { NodeTimeline } from "@engine/types";
  import ColourField from "#lib/components/ColourField.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ScrubNumber from "#lib/components/ScrubNumber.svelte";
  import Segmented from "#lib/components/Segmented.svelte";
  import FileField from "#lib/components/FileField.svelte";
  import ModelField from "#lib/components/ModelField.svelte";
  import ModelTextures from "#lib/components/ModelTextures.svelte";
  import { setNodeTextures, textureSizeOf, withMaterial, withoutTexture, withTexture } from "#lib/model-textures.js";
  import { largestOf, makeLevels } from "#lib/texture-levels.js";
  import MediaLevels from "#lib/components/MediaLevels.svelte";
  import { levelLabel, levelOfAsset, makeImageLevels, setNodeLevels, withLevel, withoutLevel } from "#lib/media-levels.js";
  import { isLevelledKind, MEDIA_LEVELS, type MediaLevelData } from "@shared/types/media-levels";
  import type { TextureSize } from "@shared/types/textures";
  import TextureField from "#lib/components/TextureField.svelte";
  import Toggle from "#lib/components/Toggle.svelte";
  import LibraryPanel from "./LibraryPanel.svelte";
  import BehaviourRules from "./BehaviourRules.svelte";
  import EntryForm from "./EntryForm.svelte";
  import { entries } from "#lib/entries.svelte.js";
  import SceneView from "./SceneView.svelte";
  import ExperiencePanel from "./ExperiencePanel.svelte";
  import GroupView from "./GroupView.svelte";
  import SurfaceView from "./SurfaceView.svelte";
  import { experienceEvents, experienceVariables, pathOfName, rulesOf, subtreeNames, treeBehaviourIssues, withRules } from "#lib/behaviour-edit.js";
  import { logicEdit } from "#lib/logic-edit.svelte.js";
  import { logicTypes, typeProblemsByRule } from "#lib/logic/project.js";

  /**
   * The selected **node** of a target's entity (the entity is a tree; the tree panel or a tap
   * on the stage selects, `node` is the path from the root) – every adjustable value as rows of one control height:
   * placement (three.js names, the three axes in one row as in Blender), a text node's text and colour, a light
   * node's values, each filter's and component's parameters. Changes show live on the stage (`stage.override` with
   * the whole tree) and reach the draft by themselves a moment later (#259, `tree-autosave.ts`: the shared entity when
   * the target refers to one, else the target's own); **Undo edits** takes the target's tree back to how the draft had
   * it before its first edit in this page. **+ node** adds a node (group, model, video, image, text,
   * light, or a node type the experience's plugins registered – #77; files from the Library) next to the selected one or
   * inside it (#163); a plugin type's parameters are rows from its spec, like a component's. **remove node** drops the
   * selected node and its children. Rows come from the content contract's definitions (one `specRow` snippet draws a
   * parameter of any kind – a `texture` as a choice of the experience's procedural textures and Library pictures, #188). A node
   * with meshes may carry a plugin's **material** (#188): its rows follow the node type's. **make it code** turns the
   * node into a node type of the experience's own, **make code** beside the material does it for its look
   * (`plugins/make-code.ts`): the plugin is saved to the Code tab and run, the node switched to it once its code builds on
   * the stage (until then it shows as it was, the error is the Code tab's – #199).
   *
   * The panel is the workspace's **Inspector** (#229): it shows whatever is selected (#162) – a selected target its
   * target fields, its entity or a node that node's rows, the breadcrumb in the head stepping up; a selected **entry**
   * (#227) the entry (`EntryView`); the **experience** (the top bar's ⚙, #237) its texts and settings (`ExperiencePanel`); the
   * **scene** – selected in the tree, or nothing else selected – its sections (`SceneView`: the scene,
   * post-processing, vars and events).
   */
  let { stage, experienceId, sceneId, selected, node = $bindable([]), pickColour, ontargetchanged, oncode, onenvironment, onopenscene }: {
    stage: Stage | null; experienceId: string; sceneId: string; selected: string | null; node: number[];
    /** The scene's environment row: the workspace opens the Environment tab */
    onenvironment?: () => void;
    /** A goto's link in the scene's timeline: the workspace opens that scene */
    onopenscene?: (sceneId: string) => void;
    /** Show the Code tab (a made plugin's error is there) */
    oncode?: () => void;
    /** Pick a colour from the stage (the workspace owns the picking overlay) */
    pickColour?: () => Promise<string | null>;
    /** The target's image or print placement changed in the draft: reload the content and the stage */
    ontargetchanged?: () => Promise<void>;
  } = $props();

  $effect(() => {
    if (library.experienceId !== experienceId) void library.load(experienceId);
  });
  $effect(() => {
    if (entries.experienceId !== experienceId) void entries.load(experienceId);
  });

  const targets = $derived((content.scene(sceneId)?.targets ?? []).filter(target => target.imageSrc));
  /** The selected target; none while the scene is selected – nothing stands in for a selection (#229) */
  const target = $derived<Target | undefined>(selection.scene ? undefined : targets.find(t => t.id === selected));
  /**
   * The entry selected in the tree (#227), as the content holds it: its form instead of its target (#223) – it stays
   * when a save moved it to another scene
   */
  const entry = $derived(entries.byId(selection.entry));
  /**
   * An entry's save changed the draft: read it again. The stage is built again only for what it shows of an entry –
   * its title (`{{entry.title}}`) and the scene it is on; a text typed further restarts nothing there
   */
  const entrySaved = async (_saved: unknown, changes: Record<string, unknown>) => {
    await content.load(experienceId);
    if ("title" in changes || "scene" in changes || "surface" in changes) await stage?.refresh();
  };

  /** The whole tree being edited (null = the target has no entity yet) */
  let entity = $state<EntityData | null>(null);
  let uniformScale = $state(true);
  /** What an action of the panel says when it is done (a node made code) */
  let saved = $state<string | null>(null);
  let error = $state<string | null>(null);
  let editingTarget = $state<string | null>(null);

  // The tree shown: the stage's live tree of the target (the rows, the tree's moves and the gizmo write it) while the
  // draft does not hold it yet, else the draft's – a save, a reload and another target all arrive here
  let shownTree: EntityData | null = null;
  $effect(() => {
    const t = target;
    const live = t ? stage?.overrides.get(t.id) : undefined;
    const next = !t || live === Stage.REMOVED ? null : live ?? t.entity ?? null;
    untrack(() => {
      if (editingTarget !== (t?.id ?? null)) {
        editingTarget = t?.id ?? null;
        saved = null;
        error = null;
      }
      if (shownTree !== next || (entity === null) !== (next === null)) {
        shownTree = next;
        entity = next;
      }
    });
  });

  /** The selected node; a path the tree no longer has falls back to the root */
  const current = $derived<EntityData | null>(entity ? (nodeAt(entity, node) ?? entity) : null);
  /** The level of the selection (#162): the target's fields, or its entity / a node of it (a target without a tree: the target) */
  const atTarget = $derived(selection.onTarget || !entity);
  const crumbs = $derived(target ? breadcrumb({ target: target.id, node, onTarget: atTarget }, entity ?? undefined) : []);
  $effect(() => {
    if (entity && !nodeAt(entity, node)) node = [];
  });
  // The uniform-scale switch follows the selected node (not every value change: the author may unlink equal axes)
  $effect(() => {
    const path = node.join(".");
    const t = editingTarget;
    void path;
    void t;
    const n = untrack(() => current);
    if (n) uniformScale = hasUniformScale(n);
  });
  /** The same node in the draft (undefined for a node the draft does not have yet) */
  const draftNode = $derived(target?.entity ? nodeAt(target.entity, node) : undefined);

  // The rows and the addable components follow the registry: a plugin's Run registers new types
  const rows = $derived.by(() => { void plugins.version; return current ? valueRows(current, uniformScale) : []; });
  const addable = $derived.by(() => { void plugins.version; return current ? componentTypesFor(current.type) : []; });
  /** The selected node's file kinds (a plugin's node type declares them – #77), undefined when it takes no file */
  const fileKinds = $derived.by(() => { void plugins.version; return current ? nodeAssetKinds(current.type) : undefined; });
  /** The selected node's plugin node type: its description heads its rows; null for a built-in type */
  const nodeSpec = $derived.by(() => { void plugins.version; return current ? nodeTypeSpec(current.type) ?? null : null; });
  /** The selected node's plugin material (#188): its spec heads its rows; the materials it may take instead */
  const materialOf = $derived.by(() => { void plugins.version; return current?.material ? materialSpec(current.material.type) ?? null : null; });
  const materialChoices = $derived.by(() => { void plugins.version; return current ? materialTypesFor(current.type) : []; });

  // ── make it code (#188): the node, or its look, becomes the experience's own code in the Code tab ──
  let making = $state(false);
  /** The error shown is a made plugin's: the Code tab has it too */
  let codeError = $state(false);
  /** A plugin node type is copied with its plugin's whole source (the source as it runs on the stage) */
  const ownerSource = async (type: string) => {
    const owner = nodeTypeOwner(type);
    if (!owner) return undefined;
    try {
      return { plugin: owner, source: await plugins.sourceOf(experienceId, owner) };
    } catch (e) {
      throw new MakeCodeError(`Make it code copies the whole plugin ${owner}, and its source could not be read – ${errorText(e)}`);
    }
  };
  const makeCode = async (kind: "node" | "material") => {
    const n = current;
    const t = target;
    if (!n || !t || making) return;
    making = true;
    error = null;
    codeError = false;
    try {
      if (plugins.experienceId !== experienceId) await plugins.load(experienceId);
      const taken = { plugins: [...plugins.stored.map(p => p.id), ...plugins.declared().map(p => p.id)] };
      const made: MadeCode = kind === "node" ? nodeTypeCode(n, taken, await ownerSource(n.type)) : materialCode(n, taken);
      await plugins.save(experienceId, made.plugin, made.source);
      // The Run switches the node once the made code builds it on the stage; until then it shows as it was
      plugins.pending = { plugin: made.plugin, type: made.type, targetId: t.id, path: [...node], from: n.type, node: made.node };
      if (!(await plugins.run(made.plugin, made.source, stage))) {
        error = `${made.plugin}: ${plugins.runError?.message ?? "the code did not run"}`;
        codeError = true;
        // The Code tab opens the made plugin with its error
        plugins.focus = made.plugin;
        return;
      }
      saved = `made ${made.type} – the plugin ${made.plugin} in the Code tab`;
    } catch (e) {
      error = errorText(e, { code: true });
    } finally {
      making = false;
    }
  };
  const ref = $derived(target ? getEntityRef(target.id) : undefined);
  const source = $derived(ref ? `shared: ${ref} (${getTargetsUsingEntity(ref).length}×)` : target ? `entry: ${target.entryId}` : "");
  /** The target's tree is not as the draft had it before its first edit in this page: *Undo edits* goes back there */
  const canUndo = $derived(!!target && differsFromBaseline(treeKey(experienceId, target.id), treeContent(entity)));

  const changed = (row: ValueRow) => !!current && (!draftNode || !sameValue(getValue(current, row), getValue(draftNode, row)));
  const anyChanged = (ids: ValueRow[]) => ids.some(changed);
  const pathLabel = $derived(node.length ? `root › ${node.join(" › ")}` : "root");

  // ── a behaviour component (#88): its rule editor's pickers and what keeps the save back ──
  const hasBehaviour = $derived(!!current?.components?.some(c => c.type === BEHAVIOUR_TYPE));
  /** What is wrong with the tree's behaviours (an empty name, an event not chosen yet): shown, and the save waits until it is complete */
  const behaviourProblems = $derived(entity ? treeBehaviourIssues(entity) : []);
  /** Every tree of the experience (the draft's, this one as edited): the variables and events its behaviours use */
  const experienceTrees = $derived([...content.scenes.flatMap(s => s.targets).filter(t => t.id !== target?.id).flatMap(t => (t.entity ? [t.entity] : [])), ...(entity ? [entity] : [])]);
  /** The scenes' and the experience's rules (schema 5.0): their variables and events are offered too */
  const logicRuleSets = $derived([...logicEdit.experienceRules(), ...content.scenes.flatMap(s => logicEdit.sceneRules(s.id))]);
  const ruleVariables = $derived([...new Set([...experienceVariables(experienceTrees, (stage?.vars ?? []).map(v => v.name), logicRuleSets), ...Object.keys(logicEdit.declared() ?? {})])].sort());
  const ruleEvents = $derived(experienceEvents(experienceTrees, (stage?.events ?? []).map(e => e.event), logicRuleSets));
  /** The variables' types (declared, else inferred) – the draft's trees with this one as edited */
  const ruleTypes = $derived(logicTypes(logicEdit.withLogic({
    scenes: content.scenes.map(s => ({ ...s, targets: s.targets.map(t => (t.id === target?.id && entity ? { ...t, entity } : t)) })),
  })));
  const gotoScenes = $derived(content.scenes.map(s => ({ id: s.id, label: s.label || s.id })));
  /** The clips of the models under the selected node by node name ("" = the node itself), read from the stage as the models load */
  let behaviourClips = $state<Record<string, string[]>>({});
  $effect(() => {
    const t = target;
    const s = stage;
    const n = current;
    const at = node;
    if (!t || !s || !n || !hasBehaviour) return;
    const read = () => {
      const next: Record<string, string[]> = {};
      for (const name of ["", ...subtreeNames(n)]) {
        const path = pathOfName(n, name);
        const clips = path ? s.timeline(t.id, [...at, ...path])?.clips.map(c => c.name) : undefined;
        if (clips?.length) next[name] = clips;
      }
      if (JSON.stringify(next) !== JSON.stringify(untrack(() => behaviourClips))) behaviourClips = next;
    };
    read();
    const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  });

  /** An edit of the tree: shown at once (the stage's live tree, which the panel follows), saved by itself */
  const apply = (next: EntityData) => {
    shownTree = next;
    entity = next;
    saved = null;
    if (target) stage?.override(target.id, next);
  };
  /** Replace the selected node in the tree */
  const applyNode = (next: EntityData) => entity && apply(withNode(entity, node, next));
  const set = (row: ValueRow, value: number | string) => current && applyNode(setValue(current, row, value));

  /** Undo edits: the tree as the draft had it before its first edit in this page – live at once, saved like any edit */
  const revert = () => {
    if (!target || !stage) return;
    const before = baselineOf<EntityData>(treeKey(experienceId, target.id));
    if (before === undefined) return;
    void stage.override(target.id, before ?? Stage.REMOVED);
    node = [];
    saved = null;
  };

  // ── the Library as the picker of a file (#164): opened for one field – the target's image, the node's file, the
  // new node's file – it fills only that one; the panel keeps its state underneath ──
  let picking = $state<LibraryPick | null>(null);
  const pickFor = (pick: Omit<LibraryPick, "oncancel">) => {
    picking = { ...pick, onpick: asset => { picking = null; return pick.onpick(asset); }, oncancel: () => (picking = null) };
  };
  // Another target or node selected (the tree, the stage) while picking: the field it was opened for is gone
  const pickContext = $derived(`${target?.id}|${node.join(".")}|${selection.entry}`);
  $effect(() => {
    void pickContext;
    untrack(() => { picking = null; textureError = null; levelError = null; });
  });
  const pickTargetImage = () => {
    const t = target;
    if (t) pickFor({ subject: { for: "target-image" }, label: `the printed image of ${t.id}`, current: t.imageSrc, onpick: asset => setTargetImage(t.id, asset.url) });
  };
  const pickNodeFile = () => {
    const t = target;
    const type = current?.type;
    if (!t || !type) return;
    // The picker's head names the node as the tree does: its name, else where it sits (#170)
    const which = current?.name ? `“${current.name}”` : node.length ? `node ${pathLabel}` : "the root node";
    pickFor({ subject: { for: "node", nodeType: type }, label: `the ${type} of ${which}`, current: current?.assets[0]?.src,
      onpick: asset => { if (isMediaAsset(asset)) useAsset(asset.kind, asset.url, asset.id); } });
  };
  const pickNewNodeFile = () => {
    const type = addType;
    if (type) pickFor({ subject: { for: "node", nodeType: type }, label: `the new ${type} node`, current: addAsset, onpick: asset => { addAsset = asset.url; } });
  };

  // ── the target: its printed image and placement ──
  let placementOpen = $state(false);
  let targetBusy = $state(false);
  let targetError = $state<string | null>(null);
  let print = $state<TargetPlace>({ x: 40, y: 60, width: 80 });
  // The x / y rows are read and entered from the stage's origin (the toolbar's view group); `print` keeps the content's frame
  let origin = $state(getPreview().origin);
  $effect(() => subscribePreview(state => (origin = state.origin)));
  const sceneSurfaces = $derived(scenes.scene(sceneId)?.surfaces);
  const frame = $derived(flatFrame(sceneSurfaces));
  /** The surfaces a print may lie on: the scene's, by id; a choice writes the id while the scene has several */
  const surfaceOptions = $derived(surfaceChoices(sceneSurfaces));
  const surfaceLabels = $derived(Object.fromEntries(surfaceOptions.map(c => [c.value, c.label])));
  /** The surface the place lies on (`TargetPlace.surface`, else the first) */
  const on = $derived(choiceOf(surfaceOptions, print) ?? undefined);
  const shown = $derived(toOrigin(origin, frame, on, print.x, print.y));
  const setShown = (x: number, y: number) => editPrint({ ...print, ...fromOrigin(origin, frame, on, x, y) });
  /**
   * Another surface (#314): the print keeps its place in mm where it fits there, else it is centred (made smaller when
   * too big – `moveToSurface`); its height when the place has none is the stage's (from the image)
   */
  const chooseSurface = (value: string) => {
    const choice = surfaceOptions.find(c => c.value === value);
    const to = sceneSurfaces?.find(s => s.id === value);
    if (!choice || value === on) return;
    if (!to) { editPrint(placeOnChoice(print, choice, surfaceOptions)); return; }
    const height = target ? stage?.placeOf(target.id)?.height : undefined;
    editPrint(moveToSurface(print, to, surfaceOptions.length > 1, height).place);
  };
  /**
   * A target without a place of its own: where the stage shows it – the stage's fallback place – so the rows, the
   * handles and the print agree from the first look
   */
  const placeFromBookLayout = (t: Target) => {
    const place = stage?.placeOf(t.id) ?? null;
    if (!place) return;
    // A fallback's height is only a guess (the image's aspect decides)
    const { height: _height, ...box } = place;
    print = box;
  };
  /** The target whose edited placement is on its way to the draft, and which edit of it is the newest */
  let placementPending: string | null = null;
  let placementEdits = 0;
  // The placement follows the target: its own place; else the stage's fallback while the placement is open. An edit on
  // its way to the draft is not taken back by the draft as it still is
  $effect(() => {
    const t = target;
    if (t && placementPending === t.id) return;
    if (t?.place) print = { ...t.place };
    else if (t && untrack(() => placementOpen)) placeFromBookLayout(t);
  });
  const togglePlacement = () => {
    if (!placementOpen && target && !target.place) placeFromBookLayout(target);
    placementOpen = !placementOpen;
  };
  // While the placement rows are open the target lies at the edited place on the stage (its print and its entity), with handles
  $effect(() => {
    const t = target;
    const open = placementOpen;
    const where = { ...(print.surface ? { surface: print.surface } : {}), x: print.x, y: print.y, width: print.width };
    stage?.ghost(open && t ? { targetId: t.id, imageSrc: t.imageSrc, ...where, ...(print.height !== undefined ? { height: print.height } : {}) } : null);
  });
  $effect(() => () => stage?.ghost(null));
  // The handles on the stage move the ghost: the placement rows follow
  $effect(() => {
    if (!stage || !placementOpen) return;
    // A move onto another surface names it (while the scene has several); the stored height follows the width
    stage.onGhostChange = place => editPrint({ ...(print.height !== undefined ? { height: print.height } : {}), ...place });
    return () => { if (stage) stage.onGhostChange = null; };
  });
  /** The target's printed image becomes a library file (picked) or a new upload */
  const setTargetImage = async (targetId: string, src: string | File) => {
    targetBusy = true;
    targetError = null;
    try {
      // A new printed image is named by its entry (`p118-1_target.webp`, #298)
      const entryId = target?.id === targetId ? target.entryId : undefined;
      const url = typeof src === "string" ? src : (await library.upload(experienceId, src, { fit: "target", entry: entryId })).url;
      await putTarget(experienceId, targetId, { imageSrc: url });
      await ontargetchanged?.();
      // Its recognition frame, made by itself from the new image (#306) – after the change, never in its way
      recognitionFrames.autoFor(experienceId, targetId, url);
    } catch (e) {
      targetError = errorText(e);
    } finally {
      targetBusy = false;
    }
  };
  /**
   * A placement edit (the rows, the handles on the stage): shown at once, in the draft a moment after the last one
   * (#259) – from then on the target has a placement of its own
   */
  const editPrint = (next: TargetPlace) => {
    print = next;
    const t = target;
    if (!t) return;
    const experience = experienceId;
    const id = t.id;
    const edit = ++placementEdits;
    placementPending = id;
    autosave.queue(`print:${experience}:${id}`, async () => {
      await putTarget(experience, id, { place: next });
      if (placementEdits === edit) placementPending = null;
      await ontargetchanged?.();
      // Placed on a surface without a recognition frame yet: made by itself (#306), once per image
      recognitionFrames.autoFor(experience, id);
    });
  };
  /** The target in the experience or switched off (#249): the reader leaves a switched-off target and its entry out */
  const setInExperience = async (on: boolean) => {
    if (!target) return;
    targetBusy = true;
    targetError = null;
    try {
      await putTarget(experienceId, target.id, { enabled: on });
      await ontargetchanged?.();
    } catch (e) {
      targetError = errorText(e);
    } finally {
      targetBusy = false;
    }
  };
  /** Make recognition frame / Remake (#306): from the printed image as the draft holds it; a failure shows quietly below */
  const makeFrame = () => {
    const made = target ? frameTargetOf(target.id) : null;
    if (made) void recognitionFrames.make(experienceId, made);
  };
  /** Original only (#306): the target always uses its printed image, even when the experience says prepared */
  const setRecognitionOff = async (on: boolean) => {
    if (!target) return;
    targetBusy = true;
    targetError = null;
    try {
      await putTarget(experienceId, target.id, { recognitionOff: on });
      await ontargetchanged?.();
    } catch (e) {
      targetError = errorText(e);
    } finally {
      targetBusy = false;
    }
  };
  /** A file uploaded for the selected node: the node takes it (live, and saved by itself like every edit) */
  const uploadForNode = async (file: File) => {
    if (!current || !target) return;
    try {
      const asset = await library.upload(experienceId, file);
      if (isMediaAsset(asset)) useAsset(asset.kind, asset.url, asset.id);
    } catch {
      // library.error says
    }
  };
  // ── a model's texture sets (#260): its map in several sizes, chosen by the reader's texture quality ──
  let textureError = $state<string | null>(null);
  const modelTextures = $derived(current?.type === "model" ? current.assets[0]?.textures : undefined);
  /** Library pictures become maps of the set at `index`: each by its own size; what is no map is named, the rest taken */
  const addTextures = (index: number, assets: readonly Asset[]) => {
    if (!current) return;
    let sets = current.assets[0]?.textures;
    const problems: string[] = [];
    for (const asset of assets) {
      const size = textureSizeOf(asset);
      if ("problem" in size) problems.push(size.problem);
      else sets = withTexture(sets, index, size.size, asset.url);
    }
    textureError = problems.length ? problems.join(" ") : null;
    if (sets !== current.assets[0]?.textures) applyNode(setNodeTextures(current, sets ? [...sets] : undefined));
  };
  const pickTexture = (index: number) => {
    const which = current?.name ? `“${current.name}”` : node.length ? `node ${pathLabel}` : "the root node";
    pickFor({ subject: { for: "model-texture" }, label: `a map of the model of ${which}`, onpick: asset => addTextures(index, [asset]) });
  };
  const uploadTextures = async (index: number, files: File[]) => {
    const assets: Asset[] = [];
    for (const file of files) {
      try {
        // A map keeps up to 4096 px (the image rule's `texture` fit, #331)
        assets.push(await library.upload(experienceId, file, "texture"));
      } catch {
        // library.error says
      }
    }
    addTextures(index, assets);
  };

  // ── a map's smaller levels computed in the browser (#331 step 2): uploaded, then put in the set ──
  let textureBusy = $state<{ set: number; text: string } | null>(null);
  const uploadLevels = async (index: number, source: Blob, sourceName: string, have: TextureSize[], first: Asset[] = []) => {
    const assets = [...first];
    try {
      const made = await makeLevels(source, sourceName, have, size => (textureBusy = { set: index, text: `computing ${size} px…` }));
      for (const level of made.sizes) {
        textureBusy = { set: index, text: `uploading ${level.size} px…` };
        assets.push(await library.upload(experienceId, level.file, "texture"));
      }
    } catch (e) {
      textureError = e instanceof Error ? e.message : String(e);
    } finally {
      textureBusy = null;
    }
    if (assets.length) addTextures(index, assets);
  };
  /** The sizes a set lacks below its largest map, from that map */
  const computeTextures = async (index: number) => {
    const set = modelTextures?.[index];
    const top = largestOf(set);
    if (!set || !top) return;
    textureError = null;
    textureBusy = { set: index, text: `reading the ${top.size} px map…` };
    try {
      const response = await fetch(top.src);
      if (!response.ok) throw new Error(`the ${top.size} px map could not be read (${response.status})`);
      await uploadLevels(index, await response.blob(), library.byUrl(top.src)?.name ?? top.src.replace(/^.*\//, ""), set.sizes.map(entry => entry.size));
    } catch (e) {
      textureError = e instanceof Error ? e.message : String(e);
      textureBusy = null;
    }
  };
  /** One picture: uploaded at its size, every smaller level made from it */
  const texturesFromOne = async (index: number, file: File) => {
    textureError = null;
    textureBusy = { set: index, text: `uploading ${file.name}…` };
    let asset: Asset;
    try {
      asset = await library.upload(experienceId, file, "texture");
    } catch {
      textureBusy = null;
      return; // library.error says
    }
    const size = textureSizeOf(asset);
    if ("problem" in size) {
      textureError = size.problem;
      textureBusy = null;
      return;
    }
    const have = (modelTextures?.[index]?.sizes ?? []).map(entry => entry.size).filter(s => s !== size.size);
    await uploadLevels(index, file, file.name, [size.size, ...have], [asset]);
  };

  // ── a picture's, video's or sound's quality levels (#331 step 3, schema 4.3): chosen by the reader's media quality ──
  let levelError = $state<string | null>(null);
  let levelBusy = $state<string | null>(null);
  const levelKind = $derived.by(() => {
    const kind = current?.assets[0]?.assetType;
    return isLevelledKind(kind) ? kind : null;
  });
  const nodeLevels = $derived<readonly MediaLevelData[] | undefined>(levelKind ? current?.assets[0]?.levels : undefined);
  /** Files become levels: each at the level given, else the one read from the file (an image's or video's size) */
  const addLevels = (files: readonly { asset: Asset; level?: number }[]) => {
    if (!current || !levelKind) return;
    let levels = current.assets[0]?.levels;
    const problems: string[] = [];
    for (const { asset, level } of files) {
      const read = level === undefined ? levelOfAsset(asset, levelKind) : { level };
      if ("problem" in read) problems.push(read.problem);
      else levels = withLevel(levels, read.level, asset.url);
    }
    levelError = problems.length ? problems.join(" ") : null;
    if (levels !== current.assets[0]?.levels) applyNode(setNodeLevels(current, levels ? [...levels] : undefined));
  };
  const pickLevel = (level: number) => {
    const type = current?.type;
    if (!type || !levelKind) return;
    const which = current?.name ? `“${current.name}”` : node.length ? `node ${pathLabel}` : "the root node";
    pickFor({ subject: { for: "node", nodeType: type }, label: `the ${levelLabel(levelKind, level)} level of ${which}`,
      onpick: asset => { if (asset.kind === levelKind) addLevels([{ asset, level }]); else levelError = `${asset.name} is no ${levelKind}.`; } });
  };
  const uploadLevel = async (level: number, file: File) => {
    levelError = null;
    levelBusy = `uploading ${file.name}…`;
    try {
      // A picture's level keeps up to its size (the image rule's 2048 is the largest image level)
      const asset = await library.upload(experienceId, file);
      if (asset.kind !== levelKind) levelError = `${asset.name} is no ${levelKind}.`;
      else addLevels([{ asset, level }]);
    } catch {
      // library.error says
    } finally {
      levelBusy = null;
    }
  };
  /** Pictures: the levels below the largest one (or the node's own file when it has none), computed here in the browser */
  const computeImageLevels = async () => {
    const own = current?.assets[0];
    if (!own || levelKind !== "image") return;
    const top = [...(own.levels ?? [])].sort((a, b) => b.level - a.level)[0];
    const src = top?.src ?? own.src;
    levelError = null;
    levelBusy = "reading the picture…";
    const made: { asset: Asset; level?: number }[] = [];
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`the picture could not be read (${response.status})`);
      const have = (own.levels ?? []).map(entry => entry.level);
      const result = await makeImageLevels(await response.blob(), library.byUrl(src)?.name ?? src.replace(/^.*\//, ""), have,
        level => (levelBusy = `computing ${level} px…`));
      // The node's own file stands for its level when it has none yet
      const ownAsset = library.byUrl(src);
      if (!top && ownAsset && !have.includes(result.level)) made.push({ asset: ownAsset, level: result.level });
      for (const level of result.levels) {
        levelBusy = `uploading ${level.level} px…`;
        made.push({ asset: await library.upload(experienceId, level.file), level: level.level });
      }
      if (!result.levels.length && !made.length) levelError = `Nothing to compute: the levels below ${result.level} px are there (${MEDIA_LEVELS.image.join(", ")}).`;
    } catch (e) {
      levelError = e instanceof Error ? e.message : String(e);
    } finally {
      levelBusy = null;
    }
    if (made.length) addLevels(made);
  };

  /** The selected node takes a file (the library's Use, an upload) */
  export const useAsset = (kind: AssetData["assetType"], src: string, assetId: string) => {
    if (!current || !target) return;
    const kinds = nodeAssetKinds(current.type);
    if (!kinds?.includes(kind)) return;
    applyNode({ ...current, assets: [{ id: `${target.id}-${assetId.slice(0, 8)}`, assetType: kind, src }] });
  };

  // ── the timeline of a model node (the animation component drives the same clip) ──
  // The scene builds a node once its model is loaded: the panel looks every frame until the timeline is there, then
  // reads its state every frame (the time runs)
  let timeline = $state.raw<NodeTimeline | null>(null);
  let timelineState = $state<{ clip: string; time: number; playing: boolean; duration: number } | null>(null);
  $effect(() => {
    const t = target;
    const path = node;
    const s = stage;
    const wantsTimeline = current?.type === "model";
    timeline = null;
    timelineState = null;
    if (!t || !s || !wantsTimeline) return;
    let frame = 0;
    const tick = () => {
      const tl = s.timeline(t.id, path);
      if (tl !== timeline) timeline = tl;
      timelineState = tl ? tl.state() : null;
      frame = requestAnimationFrame(tick);
    };
    // Untracked: the first look runs inside the effect, and reading `timeline` there would rerun it endlessly
    untrack(tick);
    return () => cancelAnimationFrame(frame);
  });
  const clipNames = $derived(timeline?.clips.map(c => c.name) ?? []);
  const fmt = (seconds: number) => `${seconds.toFixed(2)} s`;

  // ── + node ──
  let addType = $state<NodeType | "">("");
  let addAsset = $state("");
  /** The node types + node offers: the built-in ones, then the ones the experience's plugins registered (#77) */
  const pluginTypes = $derived.by(() => { void plugins.version; return pluginNodeTypes(); });
  /** The files the new node may take: the library's of its kind, and the content's (deduplicated by src) */
  const assetChoices = $derived.by(() => {
    const kinds = addType ? nodeAssetKinds(addType) : undefined;
    if (!kinds) return [];
    const seen = new Map<string, AssetData>();
    library.ofKinds(kinds).filter(isMediaAsset).forEach(a => seen.set(a.url, { id: a.id, assetType: a.kind, src: a.url }));
    getAssets().filter(a => kinds.includes(a.assetType)).forEach(a => { if (!seen.has(a.src)) seen.set(a.src, a); });
    return [...seen.values()];
  });
  const fileLabel = (src: string) => library.byUrl(src)?.name ?? fileNameOf(src);
  const canAdd = $derived(!!addType && (!nodeAssetKinds(addType) || !!addAsset));
  const add = () => {
    if (!target || !canAdd) return;
    const chosen = assetChoices.find(a => a.src === addAsset);
    // a file of the library (picked there or chosen here) brings its size: a video node is sized to it
    const child = newNode(addType, chosen ? { id: `${target.id}-${Date.now().toString(36)}`, assetType: chosen.assetType, src: chosen.src } : undefined,
      chosen ? library.byUrl(chosen.src) : null);
    // The target's first node is the root; else next to the selected node or inside it
    const placed = addNode(entity, node, child, addPlace);
    apply(placed.tree);
    selection.selectNode(target.id, placed.path);
    addType = "";
    addAsset = "";
  };
  // Where "+ node" puts the new node (#163): chosen, else the default for the selected node (next to a file node)
  let addPlaceChosen = $state<AddPlace | null>(null);
  const addPlace = $derived<AddPlace>(addPlaceChosen ?? defaultAddPlace(current ?? undefined));
  const ADD_PLACE_LABELS: Record<AddPlace, string> = { next: "next to it", inside: "inside it" };
  $effect(() => {
    void node.join(".");
    void target?.id;
    untrack(() => (addPlaceChosen = null));
  });
  const remove = () => {
    if (!entity || !target || !stage) return;
    // Through the stage (the tree's menu and the Delete key do the same): the override is the shared source
    node = stage.removeNode(target.id, node);
    saved = null;
  };
</script>

{#snippet actions()}
  <div class="actions">
    <button type="button" class="text-link" onclick={revert} disabled={!canUndo} data-help-name="Undo edits"
      data-help="Edits reach the draft by themselves, a moment after the last change – the top bar says Saved. Undo edits takes this target's AR content back to how the draft had it before its first edit since this page was opened.">Undo edits</button>
    <span class="grow"></span>
    {#if saved}<span class="small muted">{saved}</span>{/if}
    {#if error}<span class="small danger">{error}</span>{/if}
    {#if error && codeError && oncode}<button type="button" class="text-link" onclick={oncode}>Code tab</button>{/if}
  </div>
{/snippet}

{#snippet specRow(row: ValueRow, name: string)}
  <!-- A parameter of a spec (a component's, the light's) by its kind: choice, on / off, string, colour, number -->
  {#if current}
    <!-- The label is the spec's words (#173); the Info view names it with the content's name too -->
    <div class="row" class:changed={changed(row)} data-help-name={helpName(row)} title="{row.description} – default {row.default || (name === 'clip' ? '(first clip)' : row.default)}">
      <span class="label">{row.label}</span>
      {#if row.kind === "choice" && name === "look"}
        <!-- A moment's look (#268): the built-in looks and the experience's plugins' – empty plays the experience's -->
        <select class="field" aria-label="Look" value={String(getValue(current, row))} onchange={e => set(row, (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">as the experience</option>
          {#each (row.options ?? []).filter(Boolean) as look (look)}<option value={look}>{look}</option>{/each}
          {#if getValue(current, row) && !(row.options ?? []).includes(String(getValue(current, row)))}
            <!-- #269: a look nobody registered (yet): why -->
            <option value={String(getValue(current, row))}>{getValue(current, row)} ({plugins.missingNote()})</option>
          {/if}
        </select>
      {:else if row.kind === "choice"}
        <span class="controls"><Segmented options={row.options ?? []} value={String(getValue(current, row))} onchange={v => set(row, v)} /></span>
      {:else if row.kind === "boolean"}
        <span class="controls"><Toggle on={getValue(current, row) === "true"} label={row.label} onchange={on => set(row, on ? "true" : "false")} /></span>
      {:else if row.kind === "string" && name === "clip" && clipNames.length}
        <select class="field" aria-label="Clip" value={String(getValue(current, row))} onchange={e => set(row, (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">first clip ({clipNames[0]})</option>
          {#each clipNames as clip (clip)}<option value={clip}>{clip}</option>{/each}
        </select>
      {:else if row.kind === "string"}
        <input class="field" value={String(getValue(current, row))} aria-label={row.label} oninput={e => set(row, (e.currentTarget as HTMLInputElement).value)} />
      {:else if row.kind === "texture"}
        <!-- A texture (#188): none, a procedural texture of the experience's plugins, or a Library picture or video -->
        <TextureField value={String(getValue(current, row))} label={row.label} onchange={v => set(row, v)} />
      {:else if row.kind === "model"}
        <!-- A model file (#263): none, a Library model or one of the content's own -->
        <ModelField value={String(getValue(current, row))} label={row.label} onchange={v => set(row, v)} />
      {:else if row.kind === "color"}
        <ColourField value={String(getValue(current, row))} label={row.label} onchange={hex => set(row, hex)} onpick={pickColour} />
      {:else}
        <span class="w"><ScrubNumber value={Number(getValue(current, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
          unit={row.unit ?? ""} label={row.label} strict={row.strict} oninput={v => set(row, v)} /></span>
      {/if}
    </div>
  {/if}
{/snippet}

{#if selection.experience}
  <ExperiencePanel {experienceId} {stage} {sceneId} />
{:else if selection.group}
  <!-- A band of the Scenes panel (#307): the group -->
  <GroupView {experienceId} groupId={selection.group} />
{:else if selection.surface}
  <!-- A surface of a scene (#314): the Surface mode's tap, the Tree's Surfaces level -->
  <SurfaceView {experienceId} sceneId={selection.surface.scene} surfaceId={selection.surface.id} />
{:else if entry}
  <!-- The form stays while the Library picks its picture: its edits are its own -->
  {#if picking}<LibraryPanel {experienceId} pick={picking} />{/if}
  <div class="entry-form" hidden={!!picking}>
    <EntryForm {experienceId} {entry} assetsBase={content.assetsBase} vars={stage?.vars ?? []} onpick={pickFor} onsaved={entrySaved}
      onselecttarget={id => selection.selectTarget(id)} />
  </div>
{:else if selection.entry}
  <p class="small muted">{entries.error ?? "Loading the entry…"}</p>
{:else if picking}
  <LibraryPanel {experienceId} pick={picking} />
{:else if !target}
  <!-- The scene: selected, or nothing else is (a target id this scene does not have shows it too) -->
  <SceneView {stage} {experienceId} {sceneId} {onenvironment} {onopenscene} />
{:else}
  <div class="head">
    <!-- The breadcrumb (#162): target › entity › group › node – a crumb selects that level; ▾ after the target picks another -->
    <nav class="crumbs" aria-label="Selected level">
      {#each crumbs as crumb, i (i)}
        {#if i}<span class="crumb-sep" aria-hidden="true">›</span>{/if}
        {#if crumb.current}
          <span class="crumb current" aria-current="true" title="Selected: the {crumb.level}">{crumb.label}</span>
        {:else}
          <button type="button" class="crumb" onclick={() => selection.set(crumb.selection)} title="Select the {crumb.level}">{crumb.label}</button>
        {/if}
        {#if !i}
          <select class="crumb-switch" aria-label="Target" title="Another target on this scene" value={target.id} onchange={e => selection.selectTarget((e.currentTarget as HTMLSelectElement).value)}>
            {#each targets as t (t.id)}
              <option value={t.id}>{stage?.found.includes(t.id) ? "◉ " : ""}{t.id}{t.entity ? ` · ${t.entity.type}` : " · no AR"}{stage?.overrideOf(t.id) ? " *" : ""}</option>
            {/each}
          </select>
        {/if}
      {/each}
    </nav>
    <span class="small muted">{source}</span>
  </div>

  {#if atTarget}
  <div class="section"><span class="section-label">target · {target.id}</span>
    <span class="controls">
      <Toggle on={isTargetEnabled(target)} label="In the experience" disabled={targetBusy} onchange={setInExperience}
        help="On: readers find this target and read its entry. Off: the reader leaves both out until it is switched on again – the editor keeps everything and works on it as before." />
      <button type="button" class="text-link placement-toggle" class:on={placementOpen} onclick={togglePlacement}>{placementOpen ? "hide placement" : "placement"}</button>
    </span></div>
  <div class="row"><span class="label">image</span>
    <FileField src={target.imageSrc} picture accept={pickAccept({ for: "target-image" })} label="the printed image of {target.id}"
      onlibrary={pickTargetImage} onupload={f => { const id = target?.id; if (id) void setTargetImage(id, f); }} /></div>
  {@const frameStatus = recognitionFrames.status[target.id]}
  <div class="row recognition" data-help-name="Recognition frame"
    data-help="The grey frame the phone's image tracker reads, made ahead from the printed image (the editor makes it by itself when the image changes or the target is placed; the printed image stays as it is). The reader uses it only when the experience's recognition is Prepared (experience settings) – by default it makes the frame from the printed image on the phone, the path tested with every target.">
    <span class="label">recognition</span>
    <span class="controls">
      {#if target.recognition}<img class="frame-thumb" src={target.recognition.imageSrc} alt="Recognition frame of {target.id}" title="{target.recognition.width} × {target.recognition.height} px image" />{/if}
      <button type="button" class="text-link" disabled={frameStatus?.state === "making"} onclick={makeFrame}>
        {frameStatus?.state === "making" ? "making…" : target.recognition ? "remake" : "make frame"}</button>
      {#if !target.recognition && frameStatus?.state !== "making"}<span class="small muted">none yet</span>{/if}
    </span></div>
  {#if frameStatus?.state === "failed"}<p class="small danger" title={frameStatus.message}>The recognition frame was not made: {frameStatus.message} – the target itself is saved; make frame tries again.</p>{/if}
  <div class="row" data-help-name="Original only"
    data-help="On: this target always uses its printed image, even when the experience's recognition is Prepared – for a target the frame made ahead recognises worse. Off: the experience's setting decides.">
    <span class="label">original only</span>
    <span class="controls"><Toggle on={target.recognitionOff === true} label="Original only" disabled={targetBusy} onchange={setRecognitionOff} /></span></div>
  {#if placementOpen}
    {#if surfaceOptions.length > 1}
      <div class="row"><span class="label">surface</span>
        <span class="controls"><Segmented options={surfaceOptions.map(c => c.value)} labels={surfaceLabels} value={on ?? ""} label="Surface" onchange={chooseSurface} /></span></div>
    {/if}
    <div class="row"><span class="label">x · y</span>
      <span class="fields">
        <ScrubNumber value={shown.x} step={1} fallback={0} prefix="X" unit="mm" label="printed x" oninput={v => setShown(v, shown.y)} />
        <ScrubNumber value={shown.y} step={1} fallback={0} prefix="Y" unit="mm" label="printed y" oninput={v => setShown(shown.x, v)} />
      </span></div>
    <div class="row"><span class="label">width</span>
      <span class="controls">
        <span class="w"><ScrubNumber value={print.width} min={10} max={2000} step={1} fallback={60} unit="mm" label="printed width" positive oninput={v => editPrint(withWidth(print, v))} /></span>
        {#if !target.place}<span class="small muted" data-help-name="Placement" data-help="The target has no place of its own yet: the stage lays it out by itself – it keeps a place as soon as it is moved.">by the stage</span>{/if}
      </span></div>
  {/if}
  {#if targetError}<p class="small danger">{targetError}</p>{/if}
  {/if}

  {#if !atTarget}
  <div class="section"><span class="section-label">{node.length ? "node" : "entity"}{current ? ` · ${current.type}` : ""}</span>
    <span class="controls">
      {#if current}<button type="button" class="text-link" onclick={() => void makeCode("node")} disabled={making}
        data-help-name="Make it code" data-help="Turns this node into a node type of the experience's own: a plugin in the Code tab whose build reproduces the node (its type's builder as a starting point, its values as parameters), saved and run – the node switches to it once the code builds (a plugin's node type comes with its plugin's whole source). From then on it is your code.">make it code</button>{/if}
      {#if entity}<button type="button" class="text-link" onclick={remove} title="Delete removes the selected node too">{node.length ? "remove node" : "remove entity"}</button>{/if}
    </span></div>
  {#if current}
    <div class="row" class:changed={(draftNode?.name ?? "") !== (current.name ?? "")} data-help-name="Name" data-help="The node's name in the tree – for the people who make the experience; the reader does not show it. Empty: the tree shows the node's type.">
      <span class="label">name</span>
      <input class="field" value={current.name ?? ""} placeholder={typeLabel(current)} spellcheck="false" aria-label="Node name"
        oninput={e => current && applyNode(withName(current, (e.currentTarget as HTMLInputElement).value))} />
    </div>
  {/if}
  {/if}
  {#if !atTarget || !entity}
  <div class="row add" data-help="Adds a node of this type: with no AR content yet the target's root (a model, video, image, text or light, or a group to hold several – or a node type of the experience's plugins, listed under plugins once they are loaded), else next to the selected node or inside it (add as)."><span class="label">+ node</span>
    <span class="controls">
      <select class="field" aria-label="New node type" value={addType} onchange={e => { addType = (e.currentTarget as HTMLSelectElement).value as NodeType | ""; addAsset = ""; }}>
        <option value="">type…</option>
        {#each ENTITY_TYPES as type (type)}<option value={type}>{type}</option>{/each}
        {#if pluginTypes.length}
          <optgroup label="plugins">
            {#each pluginTypes as type (type)}<option value={type} title={nodeTypeSpec(type)?.description}>{type}</option>{/each}
          </optgroup>
        {/if}
      </select>
      {#if addType && nodeAssetKinds(addType)}
        <button type="button" class="pill framed grow file-pick" title="Choose the new node's file in the Library" onclick={pickNewNodeFile}>{addAsset ? fileLabel(addAsset) : "file…"}</button>
      {/if}
      <button type="button" class="pill framed" title={!entity ? "Add as the target's root node" : addPlace === "next" ? "Add next to the selected node" : "Add inside the selected node"} disabled={!canAdd} onclick={add}>add</button>
    </span></div>
    {#if entity}
      <div class="row" data-help-name="Add as" data-help="Where + node puts the new node: next to the selected node (the same parent, right after it) or inside it (its last child). Next to it is the default for a model, video or image, which rarely hold children; next to the root, both go into a new group."><span class="label">add as</span>
        <span class="controls"><Segmented options={ADD_PLACES} value={addPlace} labels={ADD_PLACE_LABELS} onchange={place => (addPlaceChosen = place)} /></span></div>
    {/if}
  {/if}

  {#if !entity || !current}
    <p class="muted small">No AR content on this target yet.</p>
    {@render actions()}
  {:else if atTarget}
    <!-- The target is selected: its entity is one step down -->
    <div class="row"><span class="label">AR content</span>
      <span class="controls"><button type="button" class="text-link" onclick={() => target && selection.selectNode(target.id, [])} title="Select the entity (its root node)">{nodeLabel(entity)}</button></span></div>
    {@render actions()}
  {:else}
    <div class="section"><span class="section-label">placement</span></div>
    {#each ["position", "rotation", "scale"] as key (key)}
      {@const axes = rows.filter(r => r.id === key || r.id.startsWith(`${key}.`))}
      {#if axes.length}
        <div class="row axis" class:changed={anyChanged(axes)} title="{axes[0].description}{axes[0].unit ? ` (${axes[0].unit})` : ''} – default {axes.map(r => r.default).join(', ')}">
          <span class="label">{key}</span>
          <span class="axes">
            <span class="fields">
              {#each axes as row (row.id)}
                {@const axis = row.id.split(".")[1]}
                <ScrubNumber value={Number(getValue(current, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
                  prefix={axis ? axis.toUpperCase() : ""} unit={row.unit === "°" ? "°" : ""} label={row.id} positive={row.id.startsWith("scale")}
                  oninput={v => set(row, v)} />
              {/each}
            </span>
          </span>
        </div>
        {#if key === "scale"}
          <!-- One scale for x, y and z, or one per axis – a switch like every on / off (#241; was Blender's chain icon) -->
          <div class="row"><span class="label">uniform</span>
            <span class="controls"><Toggle on={uniformScale} label="Uniform scale"
              title={uniformScale ? "Uniform scale: one value for x, y and z – switch off to scale per axis" : "Scale per axis – switch on for one value for x, y and z"}
              onchange={on => { uniformScale = on; if (current) applyNode(current); }} /></span></div>
        {/if}
      {/if}
    {/each}

    {#if fileKinds}
      <div class="section"><span class="section-label">file</span></div>
      <div class="row"><span class="label">{current.type}</span>
        <FileField src={current.assets[0]?.src} picture={fileKinds.includes("image")} accept={pickAccept({ for: "node", nodeType: current.type })}
          label="the {current.type} file of this node" onlibrary={pickNodeFile} onupload={f => void uploadForNode(f)} /></div>
    {/if}
    {#if current.type === "model" && current.assets[0]}
      <div class="section" title="The model's map in several sizes – the reader's texture quality chooses (the mesh loads once)"><span class="section-label">textures</span></div>
      <ModelTextures textures={modelTextures} accept={pickAccept({ for: "model-texture" })} error={textureError} busy={textureBusy}
        oncompute={i => void computeTextures(i)} onfromone={(i, file) => void texturesFromOne(i, file)}
        onlibrary={pickTexture} onupload={(i, files) => void uploadTextures(i, files)}
        onremove={(i, size) => current && applyNode(setNodeTextures(current, withoutTexture(modelTextures, i, size)))}
        onmaterial={(i, material) => current && modelTextures && applyNode(setNodeTextures(current, withMaterial(modelTextures, i, material)))} />
    {/if}
    {#if levelKind && current.assets[0]}
      <div class="section" title="The file in several qualities – the reader's media quality chooses which is loaded"><span class="section-label">levels</span></div>
      <MediaLevels kind={levelKind} levels={nodeLevels} accept={pickAccept({ for: "node", nodeType: current.type })} error={levelError} busy={levelBusy}
        onupload={(level, file) => void uploadLevel(level, file)} onlibrary={pickLevel}
        onremove={level => current && applyNode(setNodeLevels(current, withoutLevel(nodeLevels, level)))}
        oncompute={levelKind === "image" ? () => void computeImageLevels() : undefined} />
    {/if}
    {#if nodeSpec}
      <!-- A plugin's node type (#77): its parameters from its spec, in the node's params -->
      <div class="section" title={nodeSpec.description}><span class="section-label">node type · {current.type}</span></div>
      {#each rows.filter(r => r.id.startsWith("params.")) as row (row.id)}
        {@render specRow(row, row.id.split(".")[1])}
      {/each}
    {/if}
    {#if takesMaterial(current.type)}
      {#if current.material}
        <!-- A plugin's material (#188): it replaces the node's own; its parameters from its spec -->
        <div class="section" title={materialOf?.description}><span class="section-label">material · {current.material.type}</span>
          <button type="button" class="text-link" onclick={() => current && applyNode(setMaterial(current, null))}>remove</button></div>
        {#each rows.filter(r => r.id.startsWith("material.")) as row (row.id)}
          {@render specRow(row, row.id.split(".")[1])}
        {/each}
      {:else}
        <div class="row" data-help-name="Material" data-help="The material of the node's meshes: its own (what its type draws), or a material a plugin of the experience registers – it replaces the node's own; the layers still add on top. make code turns the node's own look into a material of the experience's own in the Code tab.">
          <span class="label">material</span>
          <span class="controls">
            <select class="field grow" aria-label="Material" value="" onchange={e => { const type = (e.currentTarget as HTMLSelectElement).value; if (type && current) applyNode(setMaterial(current, type)); }}>
              <option value="">its own</option>
              {#each materialChoices as type (type)}<option value={type} title={materialSpec(type)?.description}>{type}</option>{/each}
            </select>
            <button type="button" class="pill framed" disabled={making} onclick={() => void makeCode("material")} title="Make the node's own look a material of the experience's own (Code tab)">make code</button>
          </span></div>
      {/if}
    {/if}
    {#if current.type === "text"}
      <div class="section"><span class="section-label">text</span></div>
      <div class="row" class:changed={!draftNode || (draftNode.text ?? "") !== (current.text ?? "")} title="The line shown; {'{{entry.title}}'} and {'{{experience.title}}'} are replaced">
        <span class="label">text</span>
        <input class="field" value={current.text ?? ""} spellcheck="false" aria-label="Text" oninput={e => current && applyNode({ ...current, text: (e.currentTarget as HTMLInputElement).value })} />
      </div>
      <div class="row" class:changed={!draftNode || (draftNode.color ?? "#ffffff") !== (current.color ?? "#ffffff")} title="The text's colour – default #ffffff">
        <span class="label">color</span>
        <ColourField value={current.color ?? "#ffffff"} label="Text colour" onchange={hex => current && applyNode({ ...current, color: hex })} onpick={pickColour} />
      </div>
    {/if}
    {#if current.type === "light"}
      <div class="section"><span class="section-label">light</span></div>
      {#each rows.filter(r => r.id.startsWith("light.")) as row (row.id)}
        {@const name = row.id.split(".")[1]}
        {@const spotOnly = (name === "angle" || name === "penumbra") && getValue(current, { ...row, id: "light.kind" }) !== "spot"}
        {@const noReach = (name === "distance" || name === "decay") && getValue(current, { ...row, id: "light.kind" }) === "directional"}
        {#if !spotOnly && !noReach}
          {@render specRow(row, name)}
        {/if}
      {/each}
    {/if}

    {#each current.filters ?? [] as filter, i (i)}
      <div class="section"><span class="section-label">filter {i + 1} · {filter.type}</span>
        <button type="button" class="text-link" onclick={() => current && applyNode(removeFilter(current, i))}>remove</button></div>
      {#each rows.filter(r => r.id.startsWith(`filters.${i}.`)) as row (row.id)}
        <div class="row" class:changed={changed(row)} data-help-name={helpName(row)} title="{row.description} – default {row.default}">
          <span class="label">{row.label}</span>
          {#if row.kind === "color"}
            <ColourField value={String(getValue(current, row))} label={row.label} onchange={hex => set(row, hex)} onpick={pickColour} />
          {:else if row.kind === "choice"}
            <span class="controls"><Segmented options={row.options ?? []} value={String(getValue(current, row))} onchange={v => set(row, v)} /></span>
          {:else}
            <span class="w"><ScrubNumber value={Number(getValue(current, row))} min={row.min} max={row.max} step={row.step} fallback={Number(row.default)}
              unit={row.unit ?? ""} label={row.label} strict={row.strict} oninput={v => set(row, v)} /></span>
          {/if}
        </div>
      {/each}
    {/each}
    {#each current.components ?? [] as component, i (i)}
      <div class="section"><span class="section-label">component · {component.type}</span>
        <button type="button" class="text-link" onclick={() => current && applyNode(removeComponent(current, i))}>remove</button></div>
      {#if component.type === "animation" && timeline}
        <!-- The timeline: the model's clips, play / pause, the time – it drives the same clip the component plays -->
        <div class="row" title="The model's animation clips (glTF)">
          <span class="label">timeline</span>
          <span class="controls">
            <button type="button" class="icon-button framed" title={timelineState?.playing ? "Pause" : "Play"} aria-label={timelineState?.playing ? "Pause" : "Play"}
              onclick={() => (timelineState?.playing ? timeline?.pause() : timeline?.play())}><Icon name={timelineState?.playing ? "pause" : "play"} /></button>
            <span class="small muted tabular">{fmt(timelineState?.time ?? 0)} / {fmt(timelineState?.duration ?? 0)}</span>
          </span>
        </div>
        <div class="row"><span class="label"></span>
          <input class="time" type="range" min="0" max={timelineState?.duration ?? 0} step="0.01" value={timelineState?.time ?? 0} aria-label="Time in the clip"
            oninput={e => timeline?.seek(Number((e.currentTarget as HTMLInputElement).value))} />
        </div>
      {/if}
      {#if component.type === BEHAVIOUR_TYPE}
        <!-- The behaviour's rules (#88): event, condition and actions as pickers -->
        {@const rules = rulesOf(current, i)}
        {@const typeProblems = typeProblemsByRule(rules, ruleTypes)}
        <BehaviourRules {rules} names={subtreeNames(current)} clipsOf={name => behaviourClips[name] ?? []} scenes={gotoScenes} types={ruleTypes}
          problemsOf={r => typeProblems.filter(p => p.rule === r).map(p => p.message)}
          variables={ruleVariables} events={ruleEvents} uid="behaviour-{i}" onchange={next => current && applyNode(withRules(current, i, next))} />
      {/if}
      {#each rows.filter(r => r.id.startsWith(`components.${i}.`)) as row (row.id)}
        {@render specRow(row, row.id.split(".")[2])}
      {/each}
    {/each}
    {#if addable.length}
      <div class="section"><span class="section-label">add component</span>
        <span class="controls">
          {#each addable as type (type)}
            <button type="button" class="pill" disabled={!!current.components?.some(c => c.type === type)} onclick={() => current && applyNode(addComponent(current, type))}>+ {type}</button>
          {/each}
        </span></div>
    {/if}
    {#if current.type === "video"}
      <div class="section"><span class="section-label">add filter</span>
        <span class="controls">
          {#each FILTER_TYPES as type (type)}
            <button type="button" class="pill" onclick={() => current && applyNode(addFilter(current, type as FilterType))}>+ {type}</button>
          {/each}
        </span></div>
    {/if}

    {#if behaviourProblems.length}
      <ul class="problems small danger" aria-label="Behaviour problems">{#each behaviourProblems as problem (problem)}<li>{problem}</li>{/each}</ul>
    {/if}
    {@render actions()}
  {/if}
{/if}

<style>
  .head { display: flex; align-items: center; gap: .5rem; min-height: var(--control-height); }
  /* The recognition frame (#306): a small grey thumbnail, 3:4 like the frame */
  .frame-thumb { width: 1.5rem; height: 2rem; object-fit: contain; border: 1px solid var(--line); }
  .head .small { overflow-wrap: anywhere; }
  .crumbs { flex: 1; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 0 .125rem; }
  .crumb { max-width: 10rem; height: var(--control-height); padding: 0 .375rem; border: none; border-radius: var(--control-radius); background: none; color: var(--muted);
    cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (hover: hover) {
    button.crumb:hover { background: var(--hover-background); color: var(--text); }
  }
  .crumb.current { display: inline-flex; align-items: center; background: var(--selected-background); color: var(--pressed-color); cursor: default; }
  .crumb-sep { color: var(--muted); }
  /* Only the select's arrow shows; its options name the targets */
  .crumb-switch { width: 1.25rem; height: var(--control-height); padding: 0; border: none; border-radius: var(--control-radius); color: transparent; cursor: pointer; appearance: none;
    background: linear-gradient(45deg, transparent 50%, var(--muted) 50%) calc(50% - 2px) 55% / 4px 4px no-repeat,
      linear-gradient(135deg, var(--muted) 50%, transparent 50%) calc(50% + 2px) 55% / 4px 4px no-repeat; }
  @media (hover: hover) {
    .crumb-switch:hover { background-color: var(--hover-background); }
  }
  .crumb-switch option { color: var(--text); background: var(--surface); }
  @media (pointer: coarse) { .crumb-switch { width: var(--control-height); } }
  @container panel (max-width: 20rem) {
    .head { flex-wrap: wrap; gap: 0 .5rem; }
  }
  .add .controls { flex-wrap: nowrap; }
  .add .field { min-width: 0; max-width: 7rem; }
  .add .file-pick { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; justify-content: flex-start; }
  .w { width: 6rem; display: inline-flex; }
  .w :global(.scrub) { width: 100%; }
  .fields :global(.scrub) { width: 100%; }
  .axes { display: flex; align-items: center; gap: .25rem; min-width: 0; }
  .axes .fields { flex: 1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  /* Narrow: the label goes above the X / Y / Z fields, so each still shows "-180°" and its reset */
  @container panel (max-width: 23rem) {
    .row.axis { grid-template-columns: minmax(0, 1fr); gap: .125rem; padding-bottom: .125rem; }
  }
  .row > .field { width: 100%; }
  .tabular { font-variant-numeric: tabular-nums; }
  .time { width: 100%; margin: 0; accent-color: var(--text); }
  .text-link.on { color: var(--text); }
  .actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  .grow { flex: 1; }
  .problems { margin: .25rem 0 0; padding-left: 1rem; overflow-wrap: anywhere; }
</style>
