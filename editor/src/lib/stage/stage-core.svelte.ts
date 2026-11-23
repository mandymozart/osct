import { asset } from "$app/paths";
import type { AssetPath } from "$app/types";
import { Box3, type BufferAttribute, type BufferGeometry, type Camera, Group, type Intersection, type Object3D, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import type { EnvironmentData } from "@shared/types/environment";
import type { SurfacePlace, TargetPlace } from "@shared/types/game-config";
import { entityNodes } from "@engine/content/game-config";
import { onAppUi } from "@engine/scene/ui";
import { allVars, ArScene, type HandRun, observeEvents, resetVars, type RuleHome, runRuleByHand, runtimeApi, type VarScope, type VarValue } from "@engine/scene";
import { BACKDROP_LAYER } from "@engine/scene/view";
import { setDeviceStorage } from "@engine/utils/device-storage";
import { getExperience, getTarget, getTargets } from "@engine/content/game-config";
import { type ExperienceAppearance, type Moment, momentDuration } from "@shared/types/appearance";
import { ArState, type ArStatus, type EntityData, type NodeTimeline, type PassData } from "@engine/types";
import { deviceStorage } from "#lib/storage.js";
import { Gizmo, isGizmoTool, type GizmoPlacement, type GizmoSelection, type StageTool } from "./gizmo";
import { SurfaceGizmo, type SurfaceGizmoMode } from "./surface-gizmo";
import { LightHelpers } from "./light-helper";
import { applyShading, HOVER_COLOR, outline, SELECTION_COLOR, type Outline } from "./shading";
import { getPreview, parseNodeKey, setPreviewActive, setTargetHidden, subscribePreview, surfaceGridOf, type ShadingMode } from "./preview";
import { NodeHiding } from "./node-hiding";
import { MockStage } from "./mock-stage";
import { showsWorld } from "./sky";
import { MockTracker } from "./mock-tracker";
import { StageProgress } from "./progress";
import { describePayload, logEvent, type StageEvent } from "./event-log";
import { REMOVED_ENTITY } from "./stage-types";
import { modelOf, nearPointer, nodeOf, PICK_KINDS, pickable, pickByFilter, pickForMenu, samePick, type PickFilter, type PickKind, type StageHit, type StagePick } from "./pick";
import { DEFAULT_ASPECT, draggedPlace, grabOffset, placeHeight, type PlacementDrag, type Surfaces } from "./placement";
import { SceneSnapper } from "./snap-scene";
import type { StageFrame } from "./snap";
import { findSurface, ownRect, surfaceRects, type SurfaceFrame, type SurfaceReferences } from "./surfaces";

/** A placement the handles made, as the content writes it (`TargetPlace`): the surface's id while the scene has several, the box */
export interface PlacementChange {
  surface?: string;
  x: number;
  y: number;
  width: number;
  height?: number;
}

/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;
/** How long a dragged surface place is shown before the draft has it (the save and the rebuild take a moment) */
const DRAGGED_PLACE_MS = 6000;

/**
 * The editor's stage in the editor's page (#340 – the stage frame of #234 is gone; the workspace talks to it through
 * `stage.svelte.ts`): the engine's `ArScene` with the mock tracker and the mock stage
 * instead of a camera, and the editor's simulation of the game around it – which scene is open, which targets the
 * "camera" sees, which were found for the first time (the unlock animation plays once per target, *replay* plays it
 * again), and the reader's progress for the experience's plugins (`StageProgress`: unlocked targets, experience variables – the
 * engine's `api.progress`). The reader's store does none of this here: the editor owns its state. For the Inspector it
 * keeps the plugins' variables and the stage's event timeline (`vars`, `events` – each event timed from the scene's
 * opening), and lets the author act like the experience's code or a reader would: set a variable through the plugin API
 * (`setVar`), tap a found target without aiming at it (`tap`). The live overrides are the page's: it hands each one
 * over (`override`), and a gizmo drag only reports the placement (`onPlacement`) for the page to write.
 */

/**
 * A placement being edited: the image and where it would be printed (mm). With `targetId` it is that target's own
 * placement – the target itself lies there while it is edited (its print and its entity), the ghost adds the handles.
 */
export interface GhostPlace {
  /** The target whose placement this is (absent: a target not made yet – the new-target form) */
  targetId?: string;
  imageSrc: string;
  /** The surface it lies on, by id (`TargetPlace.surface`); none: the scene's first */
  surface?: string;
  x: number;
  y: number;
  width: number;
  height?: number;
}

/** What the camera focuses on (#335): the selection's surface, node or target, each by id; none = the whole scene */
export interface CameraFocus {
  surface?: string;
  node?: { targetId: string; path: number[] };
  target?: string;
  /** What the stage's corner calls it */
  label?: string;
}

export class StageCore {
  /** The override that stands for "the entity is removed" (the root went): the stage shows nothing. Compared by reference */
  static readonly REMOVED: EntityData = REMOVED_ENTITY;

  status = $state<ArStatus>("idle");
  error = $state<string | null>(null);
  sceneId = $state<string | null>(null);
  /** Targets the tracker reports found right now */
  found = $state<string[]>([]);
  /** The subtitle line of the video that plays, null when there is none */
  subtitle = $state<string | null>(null);
  /** A tap on the stage picked something (the Inspector selects it) – or nothing (null) */
  onPick: ((hit: StagePick | null) => void) | null = null;
  /** A tap on the stage hit a surface of the scene (its id, mm from its top left corner) – or none (null) */
  onSurfacePick: ((hit: { surfaceId: string; x: number; y: number } | null) => void) | null = null;
  /** A right click on the stage: what lies there (null = the page or the table) and where */
  onContextMenu: ((hit: StagePick | null, clientX: number, clientY: number) => void) | null = null;
  /** A gizmo drag moved the selected node: the page writes the placement into its override and sends it back */
  onPlacement: ((selection: GizmoSelection, placement: GizmoPlacement) => void) | null = null;
  /** What a click may pick – the select tool's filters (`pick.ts`): entities, targets, models, nodes; none on = anything */
  pickFilter = $state<PickKind[]>([]);
  /** The viewport's shading (stored with the preview settings) */
  shading = $state<ShadingMode>(getPreview().shading);

  private arScene: ArScene;
  private tracker: MockTracker | null = null;
  private mockStage: MockStage | null = null;
  /** The experience's environment on the stage (its draft's or the values being edited), null = the experience has none */
  private environment: EnvironmentData | null = null;
  /** The Environment tab is open: the world shows in every shading, and *look up* raises the camera */
  private previewing = false;
  /** The environment's world is drawn under the stage now (`sky.ts`) – it replaces the HDRI (reactive: the toolbar says so) */
  world = $state(false);
  private lookUp = 0;
  private orientation = new Quaternion();
  private gizmo: Gizmo | null = null;
  /** The helpers of the scene's light nodes (Blender-style, the editor's only) */
  private lightHelpers: LightHelpers | null = null;
  private selection: GizmoSelection | null = null;
  /** The tool in hand (reactive: the toolbar shows it): select – no gizmo – or a gizmo mode */
  tool = $state<StageTool>("select");
  /** The simulated reader's progress: the first finds and the plugins' experience variables */
  private progress = new StageProgress();
  /** The plugins' variables with their scopes (reactive: the Inspector lists them) */
  vars = $state<Array<{ scope: VarScope; name: string; value: VarValue }>>([]);
  /** The stage's event timeline, newest first */
  events = $state<StageEvent[]>([]);
  /** When the scene on the stage opened (or the game was reset): the timeline counts from here */
  private sceneOpenedAt = performance.now();
  /** The plugin API's variables, as the Inspector writes them – the same checks and `varChanged` as a plugin's `set` */
  private panelVars = runtimeApi("stage").vars;
  /** The plugin API's events, as the Logic panel fires one by hand (#334) – the same checks as a plugin's `emit` */
  private panelEvents = runtimeApi("stage").events;
  /** The event whose next line the timeline marks *by hand* (`fire`, `runRule`), null when none is awaited */
  private byHand: string | null = null;
  /** Entities shown with other values than the draft's, by target id (the page's overrides, as it sent them) */
  private overrides = new Map<string, EntityData>();
  private replayTimer = 0;
  /** The looks the panel holds (#265), played instead of the draft's; null = the draft's */
  private appearanceOverride: { appearance: ExperienceAppearance | null } | null = null;
  private cleanups: Array<() => void> = [];
  /** Shift or Ctrl is held: snapping is turned around for the drag */
  private snapModifier = false;
  /** The gizmo's and the placement handles' snapping (the toolbar's *grid & snap*) */
  private snapper = new SceneSnapper({
    frame: () => this.tracker?.stageFrame() ?? null,
    stageFrame: surface => this.snapFrame(surface),
    settings: () => getPreview(),
    surfaceGrid: surface => surfaceGridOf(getPreview(), surface),
    modifier: () => this.snapModifier,
    objects: () => this.nodeObjects(),
    prints: () => this.tracker?.placedBoxes() ?? [],
    view: () => {
      const inspection = this.arScene.inspect();
      return inspection ? { camera: inspection.camera, height: this.container.clientHeight } : null;
    },
    guides: guides => this.tracker?.setGuides(guides),
  });

  constructor(container: HTMLElement) {
    setPreviewActive(true);
    setDeviceStorage(deviceStorage);
    const arScene = new ArScene(container, {
      // No surroundings on the stage; models with a texture set show the map size the view menu asks for (#260)
      graphics: {
        getSettings: () => ({ onionSky: false, surroundings: false, textureQuality: getPreview().textureQuality }),
        subscribe: listener => subscribePreview(state => listener({ onionSky: false, surroundings: false, textureQuality: state.textureQuality })),
      },
      createTracker: ({ container, options, scene }) => {
        const tracker = new MockTracker(container, options);
        this.mockStage = new MockStage(scene, path => asset(path as AssetPath)); // static/ files the content names at runtime
        this.mockStage.setWorld(this.world);
        tracker.attachStage(this.mockStage);
        tracker.setLookUp(this.world && this.previewing ? this.lookUp : 0);
        tracker.setSurfaceReferences(this.surfaceReferences);
        tracker.ignorePointer = event => !!this.gizmo?.busy || !!this.surfaceGizmo?.busy || !!this.ghostDrag || (!!this.ghostPlace && !!this.ghostHandleAt(event.clientX, event.clientY));
        this.tracker = tracker;
        return tracker;
      },
      progress: this.progress.reader(),
      // A rule's goto (content schema 5.0): the stage stays on its scene – the timeline logs it with a link that opens the
      // scene (`SceneView`); following it while the stage plays would leave the author's open scene behind
      navigate: address => {
        const now = performance.now();
        this.events = logEvent(this.events, { event: "goto", detail: address, at: now - this.sceneOpenedAt, t: now });
      },
      debug: import.meta.env.DEV,
    });
    this.arScene = arScene;
    this.cleanups.push(
      arScene.on("status", (status, error) => {
        this.status = status;
        this.error = status === "error" ? error?.message ?? "unknown" : null;
        if (status === "running") {
          this.ensureGizmo();
          this.shade();
        }
      }),
      subscribePreview(state => {
        if (state.shading !== this.shading) {
          this.shading = state.shading;
          this.shade();
          // The world takes the HDRI's place only while rendered (outside the Environment tab)
          this.applyEnvironment();
        }
      }),
      arScene.on("targetFound", id => {
        if (!this.found.includes(id)) this.found = [...this.found, id];
        this.shade();
        // The first find unlocks: the entity's unlock animation plays (replaces the reveal)
        if (this.progress.unlock(id)) arScene.celebrate(id);
      }),
      arScene.on("targetLost", id => {
        this.found = this.found.filter(found => found !== id);
      }),
      arScene.on("subtitle", text => {
        this.subtitle = text;
      }),
      // The plugins' events and variables for the panel
      observeEvents((event, payload) => {
        const now = performance.now();
        if (event === "sceneChanged") this.sceneOpenedAt = now;
        // The line of what the Logic panel set off by hand (#334) says so – only the first line of that name, not what it set off
        const byHand = this.byHand === event;
        if (byHand) this.byHand = null;
        const detail = describePayload(payload);
        this.events = logEvent(this.events, { event, detail: byHand ? (detail ? `${detail} · by hand` : "by hand") : detail, at: now - this.sceneOpenedAt, t: now });
        if (event === "varChanged" || event === "sceneChanged") this.vars = allVars();
      }),
    );
    // Picking is the editor's own: a click (not the one that ends a gizmo drag; the tracker swallows an orbit's)
    // picks by the mode – nothing of the mode's kind there picks nothing –, a right click asks for the menu of what
    // lies there
    const onClick = (event: MouseEvent) => {
      if (onAppUi(event) || this.gizmo?.recentlyDragged() || this.surfaceGizmo?.recentlyDragged() || this.ghostHandleAt(event.clientX, event.clientY) || !container.contains(event.target as Node)) return;
      // The Surface mode (#314) picks surfaces only: no target, no node
      if (this.tool !== "surface") this.onPick?.(this.pick(event.clientX, event.clientY));
      // Which surface the click hit (#314: the Surface mode selects by it), nothing when none
      this.onSurfacePick?.(this.surfaceAt(event.clientX, event.clientY));
    };
    const onContext = (event: MouseEvent) => {
      if (onAppUi(event) || !container.contains(event.target as Node)) return;
      event.preventDefault();
      this.onContextMenu?.(pickForMenu(this.pickFilter, this.hits(event.clientX, event.clientY)), event.clientX, event.clientY);
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
    const inspection = this.arScene.inspect();
    const scene = this.sceneId;
    if (!inspection || !scene) return [];
    const rect = this.container.getBoundingClientRect();
    const point = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(point, inspection.camera);
    const found: Array<{ distance: number; hit: StageHit }> = [];
    // The entities' nodes: every placement group by its object, for the climb from a hit mesh
    const byObject = new Map<Object3D, { targetId: string; path: number[]; model: number[] | null }>();
    const roots: Object3D[] = [];
    for (const target of getTargets(scene)) {
      const tree = this.treeOf(target.id);
      if (!tree) continue;
      const nodes = entityNodes(tree);
      const models = new Set(nodes.filter(({ node }) => node.type === "model").map(({ path }) => path.join(".")));
      for (const { path } of nodes) {
        const object = inspection.nodeObject(target.id, path);
        if (object) byObject.set(object, { targetId: target.id, path, model: modelOf(path, at => models.has(at.join("."))) });
        if (object && !path.length) roots.push(object);
      }
    }
    for (const hit of this.raycaster.intersectObjects(roots, true)) {
      if (!pickable(hit.object) || !this.drawnUnder(hit, clientX, clientY, rect, inspection.camera)) continue;
      const node = nodeOf(hit.object, byObject);
      if (node) found.push({ distance: hit.distance, hit: { kind: "node", ...node } });
    }
    // The printed images: the targets themselves
    for (const hit of this.raycaster.intersectObjects(this.tracker?.targetPlanes() ?? [], false)) {
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

  /** What a click on a point of the stage (client px) picks by the filters, null when nothing they take lies there */
  pick(clientX: number, clientY: number): StagePick | null {
    return pickByFilter(this.pickFilter, this.hits(clientX, clientY));
  }

  setPickFilter(filter: PickFilter): void {
    this.pickFilter = PICK_KINDS.filter(kind => filter.includes(kind));
    this.hover(null);
  }

  // ── The hover: on a desktop, what a click would pick wears a light outline and the pointer cursor ──

  private hovered: { pick: StagePick; outline: Outline | null } | null = null;
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverFrame = 0;

  private onHoverMove = (event: PointerEvent): void => {
    // A finger has no hover (its tap shows the pick at once); a mouse on a device that cannot hover neither
    if (event.pointerType !== "mouse" || !window.matchMedia?.("(hover: hover)").matches) return;
    const busy = !!event.buttons || !!this.gizmo?.busy || !!this.surfaceGizmo?.busy || !!this.ghostDrag || onAppUi(event)
      || (!!this.ghostPlace && !!this.ghostHandleAt(event.clientX, event.clientY));
    if (busy) {
      this.hoverPoint = null;
      this.hover(null);
      this.mockStage?.setSurfaceHover(null);
      return;
    }
    // One pick per frame, however often the pointer moves
    this.hoverPoint = { x: event.clientX, y: event.clientY };
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const at = this.hoverPoint;
      if (!at) return;
      // The Surface mode (#314) hovers surfaces: the one a click would select, outlined stronger
      if (this.tool === "surface") {
        this.hover(null);
        const surface = this.surfaceAt(at.x, at.y)?.surfaceId ?? null;
        this.mockStage?.setSurfaceHover(surface);
        const canvas = this.arScene.inspect()?.domElement;
        if (canvas) canvas.style.cursor = surface ? "pointer" : "";
        return;
      }
      this.mockStage?.setSurfaceHover(null);
      this.hover(this.pick(at.x, at.y));
    });
  };

  private onHoverLeave = (): void => {
    this.hoverPoint = null;
    this.hover(null);
    this.mockStage?.setSurfaceHover(null);
  };

  /** Outline what a click would pick (not again when it is the selection, which is outlined already); null = nothing */
  private hover(pick: StagePick | null, again = false): void {
    if (!again && samePick(pick, this.hovered?.pick ?? null)) return;
    this.hovered?.outline?.remove();
    this.hovered = null;
    const canvas = this.arScene.inspect()?.domElement;
    if (canvas) canvas.style.cursor = pick ? "pointer" : "";
    if (!pick) return;
    const object = this.isSelected(pick) ? null : this.pickedObject(pick);
    this.hovered = { pick, outline: object ? outline(object, HOVER_COLOR, 1, 0.9) : null };
  }

  /** The object a pick stands for: the printed image, or the node's placement group */
  private pickedObject(pick: StagePick): Object3D | null {
    if (pick.printed) return this.tracker?.targetPlanes().find(plane => plane.userData.targetId === pick.targetId) ?? null;
    return this.arScene.inspect()?.nodeObject(pick.targetId, pick.path) ?? null;
  }

  /** The pick is the current selection (outlined in the selection's colour) */
  private isSelected(pick: StagePick): boolean {
    if (pick.printed) return this.outlinedTarget === pick.targetId;
    const selected = this.visibleSelection();
    return !!selected && samePick({ targetId: selected.targetId, path: selected.path }, pick);
  }

  /**
   * The experience's environment on the stage (#185 – it replaces the HDRI sky box): the engine's look-around world with these
   * values – the reader's pass, not a stand-in – under the stage, turned by the view as a phone's gyroscope would turn
   * it. Drawn while rendered, in place of the HDRI's sky and light (the scene's own lights, as in the reader); while the
   * Environment tab is open (`previewing`) in every shading, and *look up* raises the camera. `null`: the experience has none –
   * the HDRI again, the camera at the scene.
   */
  showEnvironment(environment: EnvironmentData | null, previewing = false): void {
    this.environment = environment;
    this.previewing = previewing;
    this.applyEnvironment();
  }

  /** The world drawn or not (`sky.ts`), the mock stage's HDRI stepping aside meanwhile */
  private applyEnvironment(): void {
    const environment = this.environment;
    const world = !!environment && showsWorld({ environment: true, previewing: this.previewing, shading: this.shading });
    const was = this.world;
    this.world = world;
    this.mockStage?.setWorld(world);
    this.tracker?.setLookUp(world && this.previewing ? this.lookUp : 0);
    if (!world || !environment) {
      if (was) this.arScene.previewEnvironment(null);
      return;
    }
    this.arScene.previewEnvironment({ environment, orientation: () => this.tracker?.worldOrientation(this.orientation) ?? this.orientation });
  }

  /** How far the previewing camera looks up from the experience (degrees) – the world's sky and horizon come into view */
  setLookUp(degrees: number): void {
    this.lookUp = degrees;
    if (this.world && this.previewing) this.tracker?.setLookUp(degrees);
  }

  /** Show a scene on the stage (the scene runs as soon as it is asked to) */
  async open(sceneId: string): Promise<void> {
    this.sceneId = sceneId;
    this.found = [];
    await this.arScene.load(sceneId);
    await this.arScene.setState(ArState.RUNNING);
    this.shade();
  }

  /** The open scene's surfaces changed in the draft: the stage lays them out again at once */
  relayout(): void {
    this.tracker?.relayout();
  }

  /** Show a target's entity with other values than the content's (live edit), `null` = the content's again */
  override(targetId: string, entity: EntityData | null): void {
    if (entity) this.overrides.set(targetId, entity);
    else this.overrides.delete(targetId);
    this.arScene.overrideEntity(targetId, entity);
    this.shade();
    this.gizmo?.select(this.visibleSelection());
    if (this.lightHelpers) this.lightHelpers.selection = this.visibleSelection();
  }

  /** Show the scene with these post-processing passes instead of the draft's (live edit), `null` = the draft's again */
  overridePasses(passes: PassData[] | null): void {
    this.arScene.overridePasses(passes);
  }

  /** Play these looks instead of the draft's (live edit, #265) – `{ appearance: null }` = none; `null` = the draft's again */
  overrideAppearance(override: { appearance: ExperienceAppearance | null } | null): void {
    this.appearanceOverride = override;
    this.arScene.overrideAppearance(override);
  }

  /** The viewport's shading on every entity of the scene (the engine builds fresh meshes: applied again after) */
  private shade(): void {
    // The code on the stage reads it too: a plugin's effect of the rendered picture stays out of the working views
    this.arScene.setShading(this.shading);
    const inspection = this.arScene.inspect();
    const scene = this.sceneId;
    if (!inspection || !scene) return;
    const roots = getTargets(scene).map(target => inspection.nodeObject(target.id, [])).filter((o): o is NonNullable<typeof o> => !!o);
    applyShading(roots, this.shading);
    // The scene's post-processing belongs to rendered only, like the HDRI's sky
    this.arScene.setPostProcessing(this.shading === "rendered");
    this.gizmo?.refreshOutline();
  }

  /** The selection while its target shows a tree (a removed root leaves the gizmo nothing to hold) */
  private visibleSelection(): GizmoSelection | null {
    return this.selection && this.treeOf(this.selection.targetId) ? this.selection : null;
  }

  // ── The gizmo: TransformControls on the selected node, writing the node's placement into the override ──

  private ensureGizmo(): void {
    if (this.gizmo) return;
    const inspection = this.arScene.inspect();
    if (!inspection) return;
    this.gizmo = new Gizmo(inspection, (selection, placement) => this.onPlacement?.(selection, placement), this.snapper);
    this.applyTool();
    this.gizmo.select(this.visibleSelection());
    this.lightHelpers = new LightHelpers(inspection, () => {
      const scene = this.sceneId;
      if (!scene) return [];
      return getTargets(scene).flatMap(target => {
        const tree = this.treeOf(target.id);
        return tree ? [{ targetId: target.id, tree }] : [];
      });
    });
    this.lightHelpers.selection = this.visibleSelection();
    // The selected target's outline follows its print (the layout builds the prints anew); the nodes hidden by the
    // tree's eye stay hidden through every rebuild of their entity (#311)
    this.cleanups.push(inspection.onFrame(() => {
      this.syncTargetOutline();
      this.hideNodes();
      // The surface gizmo follows the draft (a saved place, a rebuilt scene) – only while one is asked for or shown
      if (this.surfaceGizmoAsked.surfaceId || this.surfaceGizmo) this.syncSurfaceGizmo();
    }));
  }

  /** The nodes the tree's eye hid (#311): not drawn and not picked, on the stage only */
  private nodeHiding = new NodeHiding();

  private hideNodes(): void {
    const inspection = this.arScene.inspect();
    const hidden = getPreview().hiddenNodes;
    if (!inspection || (!hidden.length && !this.nodeHiding.size)) return;
    const objects: Object3D[] = [];
    for (const key of hidden) {
      const node = parseNodeKey(key);
      const object = node ? inspection.nodeObject(node.targetId, node.path) : null;
      if (object) objects.push(object);
    }
    this.nodeHiding.apply(objects);
  }

  /** A model node's timeline (the animation component), null for other nodes */
  timeline(targetId: string, path: number[]): NodeTimeline | null {
    return this.arScene.inspect()?.nodeTimeline(targetId, path) ?? null;
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
    const plane = id ? (this.tracker?.targetPlanes().find(p => p.userData.targetId === id) ?? null) : null;
    if (plane === (this.targetOutline?.plane ?? null)) return;
    this.targetOutline?.outline.remove();
    this.targetOutline = plane ? { plane, outline: outline(plane, SELECTION_COLOR) } : null;
  }

  /** The tool in hand: select hides the gizmo's handles (the selection stays outlined), a mode shows them */
  setTool(tool: StageTool): void {
    this.tool = tool;
    this.applyTool();
    if (tool !== "surface") this.mockStage?.setSurfaceHover(null);
    this.syncSurfaceGizmo();
  }

  private applyTool(): void {
    if (!this.gizmo) return;
    if (isGizmoTool(this.tool)) this.gizmo.mode = this.tool;
    this.gizmo.handles = isGizmoTool(this.tool);
  }

  // ── The surface gizmo (#314): in the Surface mode, on the selected surface of a free scene ──

  private surfaceGizmo: SurfaceGizmo | null = null;
  /** The surface the page put the gizmo on (null: none), and its mode */
  private surfaceGizmoAsked: { surfaceId: string | null; mode: SurfaceGizmoMode } = { surfaceId: null, mode: "translate" };
  /** A place just dragged, held until the draft has it (the save and the rebuild follow a moment later) */
  private draggedPlace: { surfaceId: string; place: Required<SurfacePlace>; until: number } | null = null;
  /** A drag of the surface gizmo ended: the surface's new place in the scene */
  onSurfacePlace: ((surfaceId: string, place: Required<SurfacePlace>) => void) | null = null;

  /** Put the surface gizmo on a surface of the open scene (null: none) – shown in the Surface mode */
  setSurfaceGizmo(surfaceId: string | null, mode: SurfaceGizmoMode): void {
    this.surfaceGizmoAsked = { surfaceId, mode };
    this.syncSurfaceGizmo();
  }

  private syncSurfaceGizmo(): void {
    const { surfaceId, mode } = this.surfaceGizmoAsked;
    const surface = this.tool === "surface" && surfaceId ? this.tracker?.sceneSurfaces().find(s => s.id === surfaceId) : undefined;
    if (!surface) {
      this.surfaceGizmo?.show(null);
      return;
    }
    if (!this.surfaceGizmo) {
      const inspection = this.arScene.inspect();
      if (!inspection || !this.mockStage) return;
      const parent = new Group();
      this.mockStage.addHelper(parent);
      this.surfaceGizmo = new SurfaceGizmo(inspection, parent, (id, place) => {
        this.draggedPlace = { surfaceId: id, place, until: performance.now() + DRAGGED_PLACE_MS };
        this.onSurfacePlace?.(id, place);
      }, () => this.snapper.active(), () => getPreview().floorMm);
      this.cleanups.push(() => this.surfaceGizmo?.dispose());
    }
    this.surfaceGizmo.mode = mode;
    const held = this.draggedPlace;
    const now = performance.now();
    const holds = !!held && held.surfaceId === surface.id && now < held.until && JSON.stringify(held.place) !== JSON.stringify(surface.place);
    if (held && !holds) this.draggedPlace = null;
    this.surfaceGizmo.show({ id: surface.id, place: holds ? held.place : surface.place, widthMm: surface.widthMm, heightMm: surface.heightMm });
  }

  /** Shift or Ctrl held (true) or let go: snapping is turned around while it is held */
  setSnapModifier(held: boolean): void {
    this.snapModifier = held;
  }

  /** Every node object of the scene's entities (shown or not), with its target – what a move may snap to */
  private nodeObjects(): Array<{ targetId: string; object: Object3D }> {
    const inspection = this.arScene.inspect();
    const scene = this.sceneId;
    if (!inspection || !scene) return [];
    return getTargets(scene).flatMap(target => {
      const tree = this.treeOf(target.id);
      if (!tree) return [];
      return entityNodes(tree).flatMap(({ path }) => {
        const object = inspection.nodeObject(target.id, path);
        return object ? [{ targetId: target.id, object }] : [];
      });
    });
  }

  /** The tree shown for a target: the live override, the draft's, or undefined when removed / none */
  treeOf(targetId: string): EntityData | undefined {
    const override = this.overrides.get(targetId);
    if (override === StageCore.REMOVED) return undefined;
    return override ?? getTarget(targetId)?.entity;
  }

  /** The colour under a point of the stage (CSS px from the container's top left), `#rrggbb` or null */
  sampleColor(x: number, y: number): string | null {
    return this.arScene.sampleColor(x, y);
  }

  /** The ghost shown (the placement being edited) and who follows its handles */
  private ghostPlace: GhostPlace | null = null;
  /** A drag of the ghost: the image (move) or its corner (width), with the grab point inside the image */
  private ghostDrag: PlacementDrag | null = null;
  /**
   * The form or the panel editing the placement listens: a handle moved it (a stored height follows the width); its
   * surface by id while the scene has several
   */
  onGhostChange: ((place: PlacementChange) => void) | null = null;

  // ── The scene's surfaces (#314) ──

  /** The open scene's surfaces in the stage frame (mm) – empty before a scene is open */
  surfaceFrames(): readonly SurfaceFrame[] {
    return this.tracker?.surfaceFrames() ?? [];
  }

  /** The surfaces the placement math counts on: the scene's (none: the stand-in double page) */
  private placeSurfaces(): Surfaces {
    return this.surfaceFrames();
  }

  /** The frame a print on `surface` snaps in: the table's (the flat surfaces), or a wall's own plane */
  private snapFrame(surface?: string): StageFrame {
    const frames = this.surfaceFrames();
    const on = surface !== undefined ? frames.find(f => f.id === surface) : undefined;
    if (on && !on.flat) return { surfaces: [ownRect(on)], local: true };
    return { surfaces: surfaceRects(frames) };
  }

  /** The stage's surface id of a place: the surface it names, else the scene's first */
  private stageSurfaceOf(place: { surface?: string }): string {
    const frames = this.surfaceFrames();
    return findSurface(frames, place.surface)?.id ?? frames[0]?.id ?? place.surface ?? "";
  }

  /** A place on a stage surface as the content writes it: the surface's id while the scene has several, else none */
  private contentSurfaceOf(surface: string): { surface?: string } {
    return this.surfaceFrames().length > 1 ? { surface } : {};
  }

  /** The surfaces outlined (`outlined`) and the one highlighted on the stage – ids of the open scene's surfaces (the Surface mode) */
  setSurfaceMarks(outlined: readonly string[], highlighted: string | null): void {
    this.tracker?.setSurfaceMarks(outlined, highlighted);
  }

  /** The reference images by scene and surface id (#314): the open scene's lie on its surfaces */
  private surfaceReferences: SurfaceReferences = {};

  setSurfaceReferences(references: SurfaceReferences): void {
    this.surfaceReferences = references;
    this.tracker?.setSurfaceReferences(references);
  }

  /** Which surface lies under a point of the stage (client px) and where on it (mm from its top left corner); null = none */
  surfaceAt(clientX: number, clientY: number): { surfaceId: string; x: number; y: number } | null {
    const hit = this.hitOnSurface(clientX, clientY);
    if (!hit) return null;
    const frame = this.surfaceFrames().find(f => f.id === hit.surface);
    // Only a hit inside the surface counts as one (the hits beyond its edge are for dragging)
    if (!frame || hit.x < 0 || hit.y < 0 || hit.x > frame.widthMm || hit.y > frame.heightMm) return null;
    return { surfaceId: hit.surface, x: Math.round(hit.x * 10) / 10, y: Math.round(hit.y * 10) / 10 };
  }

  /** Where a target lies on the stage as the content places it (its own place, else the stage's fallback) */
  placeOf(targetId: string): TargetPlace | null {
    const place = this.tracker?.placeOf(targetId);
    return place ? { ...this.contentSurfaceOf(place.surface), x: place.x, y: place.y, width: place.width, height: place.height } : null;
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
    const surface = target ? this.stageSurfaceOf(target) : "";
    this.tracker?.setGhost(
      target ? { id: "ghost", imageSrc: target.imageSrc, surface, x: target.x, y: target.y, width: target.width, height: target.height ?? target.width * DEFAULT_ASPECT } : null,
      { handlesOnly: !!own },
    );
    if (own && target) this.tracker?.placeTarget(own, { ...target, surface });
    else if (before) this.tracker?.placeTarget(null, null);
  }


  /** The ghost's handle under the pointer: "move" over the image, "width" over its corner, null elsewhere */
  private ghostHandleAt(clientX: number, clientY: number): "move" | "width" | null {
    const inspection = this.arScene.inspect();
    const parts = this.tracker?.ghostParts();
    if (!inspection || !parts || !this.ghostPlace) return null;
    const rect = this.container.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), inspection.camera);
    if (parts.corner && this.raycaster.intersectObject(parts.corner, false).length) return "width";
    if (parts.image && this.raycaster.intersectObject(parts.image, false).length) return "move";
    return null;
  }

  /** The ghost's place on the stage's surfaces (its surface by the stage's id) */
  private ghostStagePlace(): (GhostPlace & { surface: string }) | null {
    const ghost = this.ghostPlace;
    return ghost ? { ...ghost, surface: this.stageSurfaceOf(ghost) } : null;
  }

  private onGhostPointerDown = (event: PointerEvent): void => {
    const place = this.ghostStagePlace();
    if (event.button !== 0 || !place) return;
    const kind = this.ghostHandleAt(event.clientX, event.clientY);
    if (!kind) return;
    const hit = this.hitOnSurface(event.clientX, event.clientY);
    if (!hit) return;
    // The grab point inside the image (mm), so the image does not jump to the pointer
    this.ghostDrag = { kind, ...grabOffset(place, hit, this.placeSurfaces()) };
    this.container.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  private onGhostPointerMove = (event: PointerEvent): void => {
    const place = this.ghostStagePlace();
    if (!place) return;
    if (!this.ghostDrag) {
      const kind = this.ghostHandleAt(event.clientX, event.clientY);
      this.container.style.cursor = kind === "width" ? "nwse-resize" : kind === "move" ? "grab" : "";
      return;
    }
    const hit = this.hitOnSurface(event.clientX, event.clientY);
    if (!hit) return;
    const dragged = draggedPlace(place, this.ghostDrag, hit, this.placeSurfaces());
    const id = place.targetId ?? null;
    const height = placeHeight(dragged, id ? this.tracker?.printedAspect(id) : undefined);
    const snapped = this.snapper.place(id, dragged, height, this.ghostDrag.kind, event.shiftKey || event.ctrlKey);
    // Back to the content's words: the surface's id while the scene has several
    const { surface: _stage, ...rest } = snapped;
    const next: GhostPlace = { ...rest, ...this.contentSurfaceOf(snapped.surface) };
    this.ghost(next);
    this.onGhostChange?.({
      ...(next.surface !== undefined ? { surface: next.surface } : {}), x: next.x, y: next.y, width: next.width,
      ...(next.height !== undefined ? { height: next.height } : {}),
    });
    event.preventDefault();
  };

  private onGhostPointerUp = (): void => {
    if (!this.ghostDrag) return;
    this.ghostDrag = null;
    this.snapper.end();
    this.container.style.cursor = "";
  };

  /** Where a point of the screen meets the scene's surfaces (the surface's id, mm from its top left corner) */
  private hitOnSurface(clientX: number, clientY: number): { surface: string; x: number; y: number } | null {
    const inspection = this.arScene.inspect();
    if (!inspection) return null;
    const rect = this.container.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), inspection.camera);
    return this.tracker?.surfaceHit(this.raycaster) ?? null;
  }
  /** The draft changed (a save): the scene is built again from it; overrides stay until cleared */
  async refresh(): Promise<void> {
    await this.arScene.refresh();
    this.shade();
  }

  /** Every shown target is locked again, hidden, and found anew: the unlock animation plays */
  replayUnlock(targetIds?: readonly string[]): void {
    const ids = this.shownTargets(targetIds);
    this.progress.lock(ids);
    this.hideFor(ids, REPLAY_GAP_MS);
  }

  /**
   * Play a moment's look on the shown targets (#265): `reveal` – the first find again (`replayUnlock`); `found` – lost
   * and found again, unlocked as they are; `lost` – lost, and found again once the look has played out
   */
  playMoment(moment: Moment): void {
    if (moment === "reveal") return this.replayUnlock();
    const experience = this.appearanceOverride ? { appearance: this.appearanceOverride.appearance ?? undefined } : getExperience();
    this.hideFor(this.shownTargets(), moment === "lost" ? (momentDuration(experience, "lost") ?? REPLAY_GAP_MS) + REPLAY_GAP_MS : REPLAY_GAP_MS);
  }

  /**
   * Play the card look (#361) on the stage: the first shown, found target with an image flies its printed picture as the
   * reader's scan does for a glossary entry – with the experience's card look (the panel's while it edits). Nothing opens
   * after it lands: the stage has no entry to open. False when no target is shown.
   */
  playCard(): Promise<boolean> {
    const target = this.shownTargets().map(id => getTarget(id)).find(t => t?.imageSrc);
    return target?.imageSrc ? this.arScene.flyCard(target.id, { front: target.imageSrc }) : Promise.resolve(false);
  }

  /** The scene's targets with an image that are not hidden (or those of `targetIds`) */
  private shownTargets(targetIds?: readonly string[]): string[] {
    const hidden = new Set(getPreview().hidden);
    const scene = this.sceneId;
    return (targetIds ?? (scene ? getTargets(scene).filter(t => t.imageSrc).map(t => t.id) : [])).filter(id => !hidden.has(id));
  }

  /** Hide the targets (they are lost), and show them again after `ms` (found anew) */
  private hideFor(ids: readonly string[], ms: number): void {
    ids.forEach(id => setTargetHidden(id, true));
    window.clearTimeout(this.replayTimer);
    this.replayTimer = window.setTimeout(() => ids.forEach(id => setTargetHidden(id, false)), ms);
  }

  /** A new game: every variable of every scope cleared, nothing unlocked, the timeline empty and counting from now, the scene's targets found anew */
  /** The Live switch (#269): off holds the entities' clock (`ArScene.holdClock`) – the scene stands still for placing */
  setLive(live: boolean): void {
    this.arScene.holdClock(!live);
  }

  // ── The camera (#335): Home, a focus on what is selected (nothing: the whole scene), fixed to a surface or free ──

  cameraHome(): void {
    this.tracker?.home();
  }

  cameraFree(free: boolean): void {
    this.tracker?.setFree(free);
  }

  /** Focus on a surface, a node of an entity or a printed target – the first that is on the stage – else the whole scene */
  focusCamera(on: CameraFocus): void {
    const tracker = this.tracker;
    if (!tracker) return;
    if (on.surface && tracker.focusSurface(on.surface, on.label)) return;
    if (on.node && this.focusNode(on.node, on.label)) return;
    if (on.target && tracker.focusTarget(on.target, on.label)) return;
    tracker.focusScene();
  }

  /** A node's box on the stage (the stage frame, mm): its middle, the camera from where it looks now */
  private focusNode(node: { targetId: string; path: number[] }, label = node.targetId): boolean {
    const object = this.arScene.inspect()?.nodeObject(node.targetId, node.path);
    const frame = this.tracker?.stageFrame();
    if (!object || !frame || !this.tracker) return false;
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) box.setFromCenterAndSize(object.getWorldPosition(new Vector3()), new Vector3(0.05, 0.05, 0.05));
    frame.updateWorldMatrix(true, false);
    const { min, max } = box;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => frame.worldToLocal(new Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)).multiplyScalar(1000));
    const local = new Box3().setFromPoints(corners);
    const centre = local.getCenter(new Vector3());
    const size = Math.max(20, local.getSize(new Vector3()).length());
    const surface = this.tracker.placeOf(node.targetId)?.surface;
    this.tracker.focusOn({ centre: { x: centre.x, y: centre.y, z: centre.z }, width: size, height: size, label, ...(surface ? { surface } : {}) });
    return true;
  }

  resetNarrative(): void {
    resetVars();
    this.progress.reset();
    this.vars = allVars();
    this.events = [];
    this.sceneOpenedAt = performance.now();
    this.replayUnlock();
  }

  /** Set (or delete with `null`) a variable by hand, through the plugin API: the plugins listen to `varChanged` as from a plugin. The API's refusal as text, null when written */
  setVar(name: string, value: VarValue | null, scope: VarScope): string | null {
    try {
      this.panelVars.set(name, value, scope);
      this.vars = allVars();
      return null;
    } catch (error) {
      return (error instanceof Error ? error.message : String(error)).replace(/^stage: /, "");
    }
  }

  /**
   * Fire an event on the bus by hand (the Logic panel's *Fire on stage*, #334) as a plugin's `emit` does: the open scene's
   * and the experience's rules that listen to it run, every plugin listens to it, the timeline marks its line *by hand*. Only the
   * running stage changes, never the draft. The refusal as text (the stage is not running, a core event, no event name),
   * null when fired
   */
  fire(event: string, payload?: Record<string, unknown>): string | null {
    if (this.status !== "running") return "The stage is not running.";
    this.byHand = event;
    try {
      this.panelEvents.emit(event, payload);
      return null;
    } catch (error) {
      return (error instanceof Error ? error.message : String(error)).replace(/^stage: /, "");
    } finally {
      this.byHand = null;
    }
  }

  /**
   * Run one rule on the stage as if its event had come (the Logic panel's *Run this rule*, #334 – `runRuleByHand`): its
   * condition applies, its actions run, the timeline marks its `behaviour` line *by hand*. `rule`: its index in its list.
   * `stopped` while the stage does not run
   */
  runRule(home: RuleHome, rule: number): HandRun | "stopped" {
    if (this.status !== "running") return "stopped";
    this.byHand = "behaviour";
    try {
      return runRuleByHand(home, rule);
    } finally {
      this.byHand = null;
    }
  }

  /** Tap a found target's entity without aiming at it – the reader's tap (`onTap`, `targetTapped`); false when nothing was tapped */
  tap(targetId: string): boolean {
    return this.arScene.inspect()?.tap(targetId) ?? false;
  }

  /** Milliseconds since the scene on the stage opened (or the game was reset) – the timeline's clock */
  elapsed(): number {
    return performance.now() - this.sceneOpenedAt;
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
    await this.arScene.dispose();
    setPreviewActive(false);
  }
}
