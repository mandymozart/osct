import { SvelteMap } from "svelte/reactivity";
import { asset } from "$app/paths";
import type { AssetPath } from "$app/types";
import { type BufferAttribute, type BufferGeometry, type Camera, type Intersection, type Object3D, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import type { EnvironmentData } from "@shared/types/environment";
import { entityNodes } from "@engine/content/game-config";
import { onAppUi } from "@engine/scene/ui";
import { allVars, ArScene, observeEvents, resetVars, runtimeApi, type VarScope, type VarValue } from "@engine/scene";
import { BACKDROP_LAYER } from "@engine/scene/view";
import { getSpread, getTarget, getTargets } from "@engine/content/game-config";
import { SceneState, type ArStatus, type EntityData, type NodeTimeline, type PassData } from "@engine/types";
import { nodeAt, removeNode, withNode } from "#lib/values.js";
import { Gizmo, type GizmoMode, type GizmoSelection } from "./gizmo";
import { LightHelpers } from "./light-helper";
import { applyShading, HOVER_COLOR, outline, SELECTION_COLOR, type Outline } from "./shading";
import { getPreview, subscribePreview, type ShadingMode } from "./preview";
import { MockStage } from "./mock-stage";
import { MockTracker } from "./mock-tracker";
import { StageProgress } from "./progress";
import { describePayload, logEvent, type StageEvent } from "./event-log";
import { plugins } from "#lib/plugins.svelte.js";
import { setPreviewActive, setTargetHidden } from "./preview";
import type { PrintPlacement } from "#lib/api.js";
import { nearPointer, nodeOf, pickable, pickByMode, pickForMenu, samePick, type PickMode, type StageHit, type StagePick } from "./pick";
import { DEFAULT_ASPECT, draggedPlace, grabOffset, printedHeight, type PlacementDrag } from "./placement";
import { SceneSnapper } from "./snap-scene";

/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;

/**
 * The editor's stage: the engine's `ArScene` with the mock tracker and the mock stage instead of a camera, and the
 * editor's simulation of the game around it – which spread is open, which targets the "camera" sees, which were
 * found for the first time (the unlock animation plays once per target, *replay* plays it again), and the reader's
 * progress for the book's plugins (`StageProgress`: unlocked targets, book variables – the engine's `api.progress`).
 * The reader's store does none of this here: the editor owns its state. For the Stage panel it keeps the plugins'
 * variables and the stage's event timeline (`vars`, `events` – each event timed from the spread's opening), and
 * lets the author act like the book's code or a reader would: set a variable through the plugin API (`setVar`), tap
 * a found target without aiming at it (`tap`).
 */

export type { StageEvent } from "./event-log";
export type { PickMode, StagePick } from "./pick";

/**
 * A placement being edited: the image and where it would be printed (mm). With `targetId` it is that target's own
 * placement – the target itself lies there while it is edited (its print and its entity), the ghost adds the handles.
 */
export interface GhostPlace {
  /** The target whose placement this is (absent: a target not made yet – the new-target form) */
  targetId?: string;
  imageSrc: string;
  surface: "left" | "right" | "front" | "back";
  x: number;
  y: number;
  width: number;
  height?: number;
}

export class Stage {
  /**
   * The override that stands for "the entity is removed" (the root went): the stage shows nothing, the Entity panel
   * shows no node, Save writes no entity. Compared by reference.
   */
  static readonly REMOVED: EntityData = Object.freeze({ type: "group", assets: [] }) as EntityData;

  status = $state<ArStatus>("idle");
  error = $state<string | null>(null);
  spreadId = $state<string | null>(null);
  /** Targets the tracker reports found right now */
  found = $state<string[]>([]);
  /** A tap on the stage picked something (the Entity panel selects it) – or nothing (null) */
  onPick: ((hit: StagePick | null) => void) | null = null;
  /** A right click on the stage: what lies there (null = the page or the table) and where */
  onContextMenu: ((hit: StagePick | null, clientX: number, clientY: number) => void) | null = null;
  /** What a click picks (Blender's select mode, strict – `pick.ts`): an entity (its root), the node under the pointer, or a printed target */
  pickMode = $state<PickMode>("entity");
  /** The viewport's shading (stored with the preview settings) */
  shading = $state<ShadingMode>(getPreview().shading);

  private scene: ArScene;
  private tracker: MockTracker | null = null;
  private mockStage: MockStage | null = null;
  /** The environment previewed on the stage (the Environment tab), null = none */
  private environment: EnvironmentData | null = null;
  private lookUp = 0;
  private orientation = new Quaternion();
  private gizmo: Gizmo | null = null;
  /** The helpers of the spread's light nodes (Blender-style, the editor's only) */
  private lightHelpers: LightHelpers | null = null;
  private selection: GizmoSelection | null = null;
  private wantedMode: GizmoMode = "translate";
  /** The gizmo's mode (reactive: the toolbar shows it) */
  gizmoMode = $state<GizmoMode>("translate");
  /** The simulated reader's progress: the first finds and the plugins' book variables */
  private progress = new StageProgress();
  /** The plugins' variables with their scopes (reactive: the Stage panel lists them) */
  vars = $state<Array<{ scope: VarScope; name: string; value: VarValue }>>([]);
  /** The stage's event timeline, newest first */
  events = $state<StageEvent[]>([]);
  /** When the spread on the stage opened (or the game was reset): the timeline counts from here */
  private spreadOpenedAt = performance.now();
  /** The plugin API's variables, as the Stage panel writes them – the same checks and `varChanged` as a plugin's `set` */
  private panelVars = runtimeApi("stage").vars;
  /** Entities shown with other values than the draft's, by target id (reactive: the panels mark them) */
  overrides = new SvelteMap<string, EntityData>();
  private replayTimer = 0;
  private cleanups: Array<() => void> = [];
  /** Shift or Ctrl is held: snapping is turned around for the drag */
  private snapModifier = false;
  /** The gizmo's and the placement handles' snapping (the toolbar's *grid & snap*) */
  private snapper = new SceneSnapper({
    frame: () => this.tracker?.stageFrame() ?? null,
    stageFrame: () => ({ page: this.pageFormat(), format: this.format() }),
    settings: () => getPreview(),
    modifier: () => this.snapModifier,
    objects: () => this.nodeObjects(),
    prints: () => this.tracker?.printedBoxes() ?? [],
    view: () => {
      const inspection = this.scene.inspect();
      return inspection ? { camera: inspection.camera, height: this.container.clientHeight } : null;
    },
    guides: guides => this.tracker?.setGuides(guides),
  });

  constructor(container: HTMLElement) {
    setPreviewActive(true);
    const scene = new ArScene(container, {
      createTracker: ({ container, options, scene }) => {
        const tracker = new MockTracker(container, options);
        this.mockStage = new MockStage(scene, path => asset(path as AssetPath)); // static/ files the content names at runtime
        this.mockStage.setStudioSky(!this.environment);
        tracker.attachStage(this.mockStage);
        tracker.setLookUp(this.environment ? this.lookUp : 0);
        tracker.ignorePointer = event => !!this.gizmo?.busy || !!this.ghostDrag || (!!this.ghostPlace && !!this.ghostHandleAt(event.clientX, event.clientY));
        this.tracker = tracker;
        return tracker;
      },
      progress: this.progress.reader(),
    });
    this.scene = scene;
    this.cleanups.push(
      scene.on("status", (status, error) => {
        this.status = status;
        this.error = status === "error" ? error ?? "unknown" : null;
        if (status === "running") {
          this.ensureGizmo();
          this.shade();
          // The book's declared plugins registered their components while the spread loaded: the panels' rows follow
          plugins.version += 1;
        }
      }),
      subscribePreview(state => {
        if (state.shading !== this.shading) {
          this.shading = state.shading;
          this.shade();
        }
      }),
      scene.on("targetFound", id => {
        if (!this.found.includes(id)) this.found = [...this.found, id];
        this.shade();
        // The first find unlocks: the entity's unlock animation plays (replaces the reveal)
        if (this.progress.unlock(id)) scene.celebrate(id);
      }),
      scene.on("targetLost", id => {
        this.found = this.found.filter(found => found !== id);
      }),
      // The plugins' events and variables for the panel
      observeEvents((event, payload) => {
        const now = performance.now();
        if (event === "spreadChanged") this.spreadOpenedAt = now;
        this.events = logEvent(this.events, { event, detail: describePayload(payload), at: now - this.spreadOpenedAt });
        if (event === "varChanged" || event === "spreadChanged") this.vars = allVars();
      }),
    );
    // Picking is the editor's own: a click (not the one that ends a gizmo drag; the tracker swallows an orbit's)
    // picks by the mode – nothing of the mode's kind there picks nothing –, a right click asks for the menu of what
    // lies there
    const onClick = (event: MouseEvent) => {
      if (onAppUi(event) || this.gizmo?.recentlyDragged() || this.ghostHandleAt(event.clientX, event.clientY) || !container.contains(event.target as Node)) return;
      this.onPick?.(this.pick(event.clientX, event.clientY));
    };
    const onContext = (event: MouseEvent) => {
      if (onAppUi(event) || !container.contains(event.target as Node)) return;
      event.preventDefault();
      this.onContextMenu?.(pickForMenu(this.pickMode, this.hits(event.clientX, event.clientY)), event.clientX, event.clientY);
    };
    container.addEventListener("click", onClick);
    container.addEventListener("contextmenu", onContext);
    // The hover: what a click would pick, outlined lightly, with the pointer cursor (a mouse that hovers only)
    container.addEventListener("pointermove", this.onHoverMove);
    container.addEventListener("pointerleave", this.onHoverLeave);
    // The placement handles: before the tracker sees the pointer (capture), only while a ghost is shown
    container.addEventListener("pointerdown", this.onGhostPointerDown, true);
    container.addEventListener("pointermove", this.onGhostPointerMove, true);
    container.addEventListener("pointerup", this.onGhostPointerUp, true);
    container.addEventListener("pointercancel", this.onGhostPointerUp, true);
    this.cleanups.push(
      () => container.removeEventListener("click", onClick),
      () => container.removeEventListener("contextmenu", onContext),
      () => container.removeEventListener("pointermove", this.onHoverMove),
      () => container.removeEventListener("pointerleave", this.onHoverLeave),
      () => container.removeEventListener("pointerdown", this.onGhostPointerDown, true),
      () => container.removeEventListener("pointermove", this.onGhostPointerMove, true),
      () => container.removeEventListener("pointerup", this.onGhostPointerUp, true),
      () => container.removeEventListener("pointercancel", this.onGhostPointerUp, true),
    );
    this.container = container;
    this.raycaster.layers.enable(BACKDROP_LAYER);
  }

  private container: HTMLElement;
  /** Reaches the entities and the stage's own objects (the printed images, the page lie on the backdrop layer) */
  private raycaster = new Raycaster();

  /**
   * What lies under a point of the stage (client px), nearest first: the entities' nodes (each hit mesh climbs to the
   * node it belongs to; hidden targets and the editor's own lines do not count) and the printed images
   */
  private hits(clientX: number, clientY: number): StageHit[] {
    const inspection = this.scene.inspect();
    const spread = this.spreadId;
    if (!inspection || !spread) return [];
    const rect = this.container.getBoundingClientRect();
    const point = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(point, inspection.camera);
    const found: Array<{ distance: number; hit: StageHit }> = [];
    // The entities' nodes: every placement group by its object, for the climb from a hit mesh
    const byObject = new Map<Object3D, { targetId: string; path: number[] }>();
    const roots: Object3D[] = [];
    for (const target of getTargets(spread)) {
      const tree = this.treeOf(target.id);
      if (!tree) continue;
      for (const { path } of entityNodes(tree)) {
        const object = inspection.nodeObject(target.id, path);
        if (object) byObject.set(object, { targetId: target.id, path });
        if (object && !path.length) roots.push(object);
      }
    }
    for (const hit of this.raycaster.intersectObjects(roots, true)) {
      if (!pickable(hit.object) || !this.drawnUnder(hit, clientX, clientY, rect, inspection.camera)) continue;
      const node = nodeOf(hit.object, byObject);
      if (node) found.push({ distance: hit.distance, hit: { kind: "node", ...node } });
    }
    // The printed images: the targets themselves
    for (const hit of this.raycaster.intersectObjects(this.tracker?.printedPlanes() ?? [], false)) {
      const targetId = hit.object.userData.targetId as string | undefined;
      if (targetId && pickable(hit.object)) found.push({ distance: hit.distance, hit: { kind: "print", targetId } });
    }
    return found.sort((a, b) => a.distance - b.distance).map(({ hit }) => hit);
  }

  /** A hit counts where it is drawn: a mesh always, a particle or a line only within a few pixels of the pointer */
  private drawnUnder(hit: Intersection, clientX: number, clientY: number, rect: DOMRect, camera: Camera): boolean {
    const object = hit.object as Object3D & { isPoints?: boolean; isLine?: boolean; geometry?: BufferGeometry };
    let drawn: Vector3 | null = null;
    if (object.isPoints && hit.index !== undefined && object.geometry) {
      drawn = new Vector3().fromBufferAttribute(object.geometry.getAttribute("position") as BufferAttribute, hit.index).applyMatrix4(object.matrixWorld);
    } else if (object.isLine) {
      drawn = hit.pointOnLine?.clone() ?? null;
    } else {
      return true;
    }
    if (!drawn) return false;
    drawn.project(camera);
    return nearPointer({ x: clientX, y: clientY }, { x: rect.left + ((drawn.x + 1) / 2) * rect.width, y: rect.top + ((1 - drawn.y) / 2) * rect.height });
  }

  /** What a click on a point of the stage (client px) picks by the pick mode, null when nothing of its kind lies there */
  pick(clientX: number, clientY: number): StagePick | null {
    return pickByMode(this.pickMode, this.hits(clientX, clientY));
  }

  setPickMode(mode: PickMode): void {
    this.pickMode = mode;
    this.hover(null);
  }

  // ── The hover: on a desktop, what a click would pick wears a light outline and the pointer cursor ──

  private hovered: { pick: StagePick; outline: Outline | null } | null = null;
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverFrame = 0;

  private onHoverMove = (event: PointerEvent): void => {
    // A finger has no hover (its tap shows the pick at once); a mouse on a device that cannot hover neither
    if (event.pointerType !== "mouse" || !window.matchMedia?.("(hover: hover)").matches) return;
    const busy = !!event.buttons || !!this.gizmo?.busy || !!this.ghostDrag || onAppUi(event)
      || (!!this.ghostPlace && !!this.ghostHandleAt(event.clientX, event.clientY));
    if (busy) {
      this.hoverPoint = null;
      this.hover(null);
      return;
    }
    // One pick per frame, however often the pointer moves
    this.hoverPoint = { x: event.clientX, y: event.clientY };
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const at = this.hoverPoint;
      if (at) this.hover(this.pick(at.x, at.y));
    });
  };

  private onHoverLeave = (): void => {
    this.hoverPoint = null;
    this.hover(null);
  };

  /** Outline what a click would pick (not again when it is the selection, which is outlined already); null = nothing */
  private hover(pick: StagePick | null, again = false): void {
    if (!again && samePick(pick, this.hovered?.pick ?? null)) return;
    this.hovered?.outline?.remove();
    this.hovered = null;
    const canvas = this.scene.inspect()?.domElement;
    if (canvas) canvas.style.cursor = pick ? "pointer" : "";
    if (!pick) return;
    const object = this.isSelected(pick) ? null : this.pickedObject(pick);
    this.hovered = { pick, outline: object ? outline(object, HOVER_COLOR, 1, 0.9) : null };
  }

  /** The object a pick stands for: the printed image, or the node's placement group */
  private pickedObject(pick: StagePick): Object3D | null {
    if (pick.printed) return this.tracker?.printedPlanes().find(plane => plane.userData.targetId === pick.targetId) ?? null;
    return this.scene.inspect()?.nodeObject(pick.targetId, pick.path) ?? null;
  }

  /** The pick is the current selection (outlined in the selection's colour) */
  private isSelected(pick: StagePick): boolean {
    if (pick.printed) return this.outlinedTarget === pick.targetId;
    const selected = this.visibleSelection();
    return !!selected && samePick({ targetId: selected.targetId, path: selected.path }, pick);
  }

  /**
   * Preview the book's environment on the stage (the Environment tab): the engine's look-around world with these
   * values – the reader's pass, not a stand-in – under the stage, turned by the view as a phone's gyroscope would turn
   * it; the studio's sky steps aside. `null` ends it (the studio again, the camera at the book).
   */
  previewEnvironment(environment: EnvironmentData | null): void {
    const was = this.environment;
    this.environment = environment;
    this.mockStage?.setStudioSky(!environment);
    this.tracker?.setLookUp(environment ? this.lookUp : 0);
    if (!environment) {
      if (was) this.scene.previewEnvironment(null);
      return;
    }
    this.scene.previewEnvironment({ environment, orientation: () => this.tracker?.worldOrientation(this.orientation) ?? this.orientation });
  }

  /** How far the previewing camera looks up from the book (degrees) – the world's sky and horizon come into view */
  setLookUp(degrees: number): void {
    this.lookUp = degrees;
    if (this.environment) this.tracker?.setLookUp(degrees);
  }

  /** Show a spread on the stage (the scene runs as soon as it is asked to) */
  async open(spreadId: string): Promise<void> {
    this.spreadId = spreadId;
    this.found = [];
    await this.scene.load(spreadId);
    await this.scene.setState(SceneState.RUNNING);
    this.shade();
  }

  /** The current spread's format changed in the draft: the book takes its new shape on the stage at once */
  relayout(): void {
    this.tracker?.relayout();
  }

  /** Show a target's entity with other values than the content's (live edit), `null` = the content's again */
  override(targetId: string, entity: EntityData | null): void {
    if (entity) this.overrides.set(targetId, entity);
    else this.overrides.delete(targetId);
    this.scene.overrideEntity(targetId, entity);
    this.shade();
    this.gizmo?.select(this.visibleSelection());
    if (this.lightHelpers) this.lightHelpers.selection = this.visibleSelection();
  }

  /** Show the spread with these post-processing passes instead of the draft's (live edit), `null` = the draft's again */
  overridePasses(passes: PassData[] | null): void {
    this.scene.overridePasses(passes);
  }

  /** The viewport's shading on every entity of the spread (the engine builds fresh meshes: applied again after) */
  private shade(): void {
    const inspection = this.scene.inspect();
    const spread = this.spreadId;
    if (!inspection || !spread) return;
    const roots = getTargets(spread).map(target => inspection.nodeObject(target.id, [])).filter((o): o is NonNullable<typeof o> => !!o);
    applyShading(roots, this.shading);
    // The spread's post-processing belongs to rendered only, like the HDRI's sky
    this.scene.setPostProcessing(this.shading === "rendered");
    this.gizmo?.refreshOutline();
  }

  /** The selection while its target shows a tree (a removed root leaves the gizmo nothing to hold) */
  private visibleSelection(): GizmoSelection | null {
    return this.selection && this.treeOf(this.selection.targetId) ? this.selection : null;
  }

  // ── The gizmo: TransformControls on the selected node, writing the node's placement into the override ──

  private ensureGizmo(): void {
    if (this.gizmo) return;
    const inspection = this.scene.inspect();
    if (!inspection) return;
    this.gizmo = new Gizmo(inspection, (selection, placement) => {
      const target = getTarget(selection.targetId);
      const base = this.overrides.get(selection.targetId) ?? target?.entity;
      const node = base && nodeAt(base, selection.path);
      if (!base || !node) return;
      this.override(selection.targetId, withNode(base, selection.path, { ...node, params: { ...node.params, ...placement } }));
    }, this.snapper);
    this.gizmo.mode = this.wantedMode;
    this.gizmo.select(this.visibleSelection());
    this.lightHelpers = new LightHelpers(inspection, () => {
      const spread = this.spreadId;
      if (!spread) return [];
      return getTargets(spread).flatMap(target => {
        const tree = this.treeOf(target.id);
        return tree ? [{ targetId: target.id, tree }] : [];
      });
    });
    this.lightHelpers.selection = this.visibleSelection();
    // The selected target's outline follows its print (the layout builds the prints anew)
    this.cleanups.push(inspection.onFrame(() => this.syncTargetOutline()));
  }

  /** A model node's timeline (the animation component), null for other nodes */
  timeline(targetId: string, path: number[]): NodeTimeline | null {
    return this.scene.inspect()?.nodeTimeline(targetId, path) ?? null;
  }

  /** The gizmo and the light helpers follow the selection (null = none) */
  selectNode(targetId: string | null, path: number[] = []): void {
    this.selection = targetId ? { targetId, path } : null;
    this.ensureGizmo();
    this.gizmo?.select(this.visibleSelection());
    if (this.lightHelpers) this.lightHelpers.selection = this.visibleSelection();
    if (this.hovered) this.hover(this.hovered.pick, true);
  }

  /**
   * The selected target (#162): its printed image wears the selection's outline, as a selected node does; null =
   * none (a node is selected, or nothing). The gizmo stays with `selectNode`.
   */
  selectTarget(targetId: string | null): void {
    this.outlinedTarget = targetId;
    this.ensureGizmo();
    this.syncTargetOutline();
    if (this.hovered) this.hover(this.hovered.pick, true);
  }

  private outlinedTarget: string | null = null;
  private targetOutline: { plane: Object3D; outline: Outline } | null = null;

  /** Outline the selected target's print – again when the layout built it anew */
  private syncTargetOutline(): void {
    const id = this.outlinedTarget;
    const plane = id ? (this.tracker?.printedPlanes().find(p => p.userData.targetId === id) ?? null) : null;
    if (plane === (this.targetOutline?.plane ?? null)) return;
    this.targetOutline?.outline.remove();
    this.targetOutline = plane ? { plane, outline: outline(plane, SELECTION_COLOR) } : null;
  }

  setGizmoMode(mode: GizmoMode): void {
    this.wantedMode = mode;
    this.gizmoMode = mode;
    if (this.gizmo) this.gizmo.mode = mode;
  }

  /** Shift or Ctrl held (true) or let go: snapping is turned around while it is held */
  setSnapModifier(held: boolean): void {
    this.snapModifier = held;
  }

  /** Every node object of the spread's entities (shown or not), with its target – what a move may snap to */
  private nodeObjects(): Array<{ targetId: string; object: Object3D }> {
    const inspection = this.scene.inspect();
    const spread = this.spreadId;
    if (!inspection || !spread) return [];
    return getTargets(spread).flatMap(target => {
      const tree = this.treeOf(target.id);
      if (!tree) return [];
      return entityNodes(tree).flatMap(({ path }) => {
        const object = inspection.nodeObject(target.id, path);
        return object ? [{ targetId: target.id, object }] : [];
      });
    });
  }

  overrideOf(targetId: string): EntityData | undefined {
    return this.overrides.get(targetId);
  }

  /** The tree shown for a target: the live override, the draft's, or undefined when removed / none */
  treeOf(targetId: string): EntityData | undefined {
    const override = this.overrides.get(targetId);
    if (override === Stage.REMOVED) return undefined;
    return override ?? getTarget(targetId)?.entity;
  }

  /** Change a target's tree (live; Save writes it): the tree's moves, indent, outdent (#163) */
  editTree(targetId: string, edit: (tree: EntityData) => EntityData | null): boolean {
    const base = this.treeOf(targetId);
    const next = base ? edit(base) : null;
    if (!next) return false;
    this.override(targetId, next);
    return true;
  }

  /**
   * Remove a node of a target's entity (live; Save writes it): a child goes with its children, the root leaves the
   * target without AR content (`REMOVED`). Returns the path to select next – the parent, or the root.
   */
  removeNode(targetId: string, path: number[]): number[] {
    const base = this.treeOf(targetId);
    if (!base) return [];
    if (!path.length) {
      this.override(targetId, Stage.REMOVED);
      return [];
    }
    this.override(targetId, removeNode(base, path));
    return path.slice(0, -1);
  }

  /** The colour under a point of the stage (CSS px from the container's top left), `#rrggbb` or null */
  sampleColor(x: number, y: number): string | null {
    return this.scene.sampleColor(x, y);
  }

  /** The ghost shown (the placement being edited) and who follows its handles */
  private ghostPlace: GhostPlace | null = null;
  /** A drag of the ghost: the image (move) or its corner (width), with the grab point inside the image */
  private ghostDrag: PlacementDrag | null = null;
  /** The form or the panel editing the placement listens: a handle moved it (a stored height follows the width) */
  onGhostChange: ((place: { surface: "left" | "right" | "front" | "back"; x: number; y: number; width: number; height?: number }) => void) | null = null;

  /** Where a target is printed in the book's layout, null when the layout has no place for it */
  printedPlace(targetId: string): PrintPlacement | null {
    return this.tracker?.printedPlace(targetId) ?? null;
  }

  /** Where a target lies on the stage as the content places it (its own print, else the layout's, else the stage's fallback) */
  placeOf(targetId: string): PrintPlacement | null {
    const place = this.tracker?.placeOf(targetId);
    const surface = place?.surface as PrintPlacement["surface"] | undefined;
    return place && surface ? { surface, x: place.x, y: place.y, width: place.width, height: place.height } : null;
  }

  /**
   * Show where a target would be printed, with handles; null = none. A new target's (no `targetId`) is a translucent
   * image; an existing target's placement moves the target itself – its print, its outline and its entity – so it
   * never shows twice; dropping the placement (null, or another target's) puts it back where the content has it.
   */
  ghost(target: GhostPlace | null): void {
    const before = this.ghostPlace?.targetId ?? null;
    this.ghostPlace = target;
    const own = target?.targetId ?? null;
    this.tracker?.setGhost(
      target ? { id: "ghost", imageSrc: target.imageSrc, surface: target.surface, x: target.x, y: target.y, width: target.width, height: target.height ?? target.width * DEFAULT_ASPECT } : null,
      { handlesOnly: !!own },
    );
    if (own && target) this.tracker?.placeTarget(own, target);
    else if (before) this.tracker?.placeTarget(null, null);
  }

  /** The base format (one page, mm) the positions and the grid are counted in */
  pageFormat(): { width: number; height: number } {
    return this.tracker?.pageFormat() ?? { width: 230, height: 320 };
  }

  /** The current spread's format (the form and the panel offer the right surfaces) */
  format(): "spread" | "cover" | "back" {
    return (this.spreadId ? getSpread(this.spreadId)?.format : undefined) ?? "spread";
  }

  /** The ghost's handle under the pointer: "move" over the image, "width" over its corner, null elsewhere */
  private ghostHandleAt(clientX: number, clientY: number): "move" | "width" | null {
    const inspection = this.scene.inspect();
    const parts = this.tracker?.ghostParts();
    if (!inspection || !parts || !this.ghostPlace) return null;
    const rect = this.container.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), inspection.camera);
    if (parts.corner && this.raycaster.intersectObject(parts.corner, false).length) return "width";
    if (parts.image && this.raycaster.intersectObject(parts.image, false).length) return "move";
    return null;
  }

  private onGhostPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.ghostPlace) return;
    const kind = this.ghostHandleAt(event.clientX, event.clientY);
    if (!kind) return;
    const hit = this.pageAt(event.clientX, event.clientY);
    if (!hit) return;
    // The grab point inside the image (mm), so the image does not jump to the pointer
    this.ghostDrag = { kind, ...grabOffset(this.ghostPlace, hit, this.pageFormat()) };
    this.container.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  private onGhostPointerMove = (event: PointerEvent): void => {
    if (!this.ghostPlace) return;
    if (!this.ghostDrag) {
      const kind = this.ghostHandleAt(event.clientX, event.clientY);
      this.container.style.cursor = kind === "width" ? "nwse-resize" : kind === "move" ? "grab" : "";
      return;
    }
    const hit = this.pageAt(event.clientX, event.clientY);
    if (!hit) return;
    const dragged = draggedPlace(this.ghostPlace, this.ghostDrag, hit, this.pageFormat());
    const id = this.ghostPlace.targetId ?? null;
    const height = printedHeight(dragged, id ? this.tracker?.printedAspect(id) : undefined);
    const next = this.snapper.place(id, dragged, height, this.ghostDrag.kind, event.shiftKey || event.ctrlKey);
    this.ghost(next);
    this.onGhostChange?.({ surface: next.surface, x: next.x, y: next.y, width: next.width, ...(next.height !== undefined ? { height: next.height } : {}) });
    event.preventDefault();
  };

  private onGhostPointerUp = (): void => {
    if (!this.ghostDrag) return;
    this.ghostDrag = null;
    this.snapper.end();
    this.container.style.cursor = "";
  };

  /** Where a point of the screen meets the page (mm from the page's top left corner) */
  private pageAt(clientX: number, clientY: number): { surface: "left" | "right" | "front" | "back"; x: number; y: number } | null {
    const inspection = this.scene.inspect();
    if (!inspection) return null;
    const rect = this.container.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), inspection.camera);
    return this.tracker?.pageHit(this.raycaster) ?? null;
  }

  /** The draft changed (a save): the spread is built again from it; overrides stay until cleared */
  async refresh(): Promise<void> {
    await this.scene.refresh();
    this.shade();
  }

  /** Every shown target is locked again, hidden, and found anew: the unlock animation plays */
  replayUnlock(targetIds?: readonly string[]): void {
    const hidden = new Set(getPreview().hidden);
    const spread = this.spreadId;
    const ids = (targetIds ?? (spread ? getTargets(spread).filter(t => t.imageSrc).map(t => t.id) : [])).filter(id => !hidden.has(id));
    this.progress.lock(ids);
    ids.forEach(id => setTargetHidden(id, true));
    window.clearTimeout(this.replayTimer);
    this.replayTimer = window.setTimeout(() => ids.forEach(id => setTargetHidden(id, false)), REPLAY_GAP_MS);
  }

  /** A new game: every variable of every scope cleared, nothing unlocked, the timeline empty and counting from now, the spread's targets found anew */
  resetNarrative(): void {
    resetVars();
    this.progress.reset();
    this.vars = allVars();
    this.events = [];
    this.spreadOpenedAt = performance.now();
    this.replayUnlock();
  }

  /** Set (or delete with `null`) a variable by hand, through the plugin API: the plugins hear `varChanged` as from a plugin. The API's refusal as text, null when written */
  setVar(name: string, value: VarValue | null, scope: VarScope): string | null {
    try {
      this.panelVars.set(name, value, scope);
      this.vars = allVars();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message.replace(/^stage: /, "") : String(error);
    }
  }

  /** Tap a found target's entity without aiming at it – the reader's tap (`onTap`, `targetTapped`); false when nothing was tapped */
  tap(targetId: string): boolean {
    return this.scene.inspect()?.tap(targetId) ?? false;
  }

  /** Empty the timeline (variables and progress stay) */
  clearEvents(): void {
    this.events = [];
  }

  async dispose(): Promise<void> {
    window.clearTimeout(this.replayTimer);
    cancelAnimationFrame(this.hoverFrame);
    this.hover(null);
    this.gizmo?.dispose();
    this.targetOutline?.outline.remove();
    this.targetOutline = null;
    this.gizmo = null;
    this.lightHelpers?.dispose();
    this.lightHelpers = null;
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    await this.scene.dispose();
    setPreviewActive(false);
  }
}
