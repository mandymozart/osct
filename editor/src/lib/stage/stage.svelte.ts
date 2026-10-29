import { SvelteMap } from "svelte/reactivity";
import { base } from "$app/paths";
import { Object3D, Quaternion, Raycaster, Vector2 } from "three";
import type { EnvironmentData } from "@shared/types/environment";
import { entityNodes } from "@engine/content/game-config";
import { onAppUi } from "@engine/scene/ui";
import { allVars, ArScene, observeEvents, resetVars, type VarScope, type VarValue } from "@engine/scene";
import { BACKDROP_LAYER } from "@engine/scene/view";
import { getSpread, getTarget, getTargets } from "@engine/content/game-config";
import { SceneState, type ArStatus, type EntityData, type NodeTimeline, type PassData } from "@engine/types";
import { nodeAt, removeNode, withNode } from "$lib/values";
import { Gizmo, type GizmoMode, type GizmoSelection } from "./gizmo";
import { LightHelpers } from "./light-helper";
import { applyShading, outline, SELECTION_COLOR, type Outline } from "./shading";
import { getPreview, subscribePreview, type ShadingMode } from "./preview";
import { MockStage } from "./mock-stage";
import { MockTracker } from "./mock-tracker";
import { StageProgress } from "./progress";
import { logEvent, type StageEvent } from "./event-log";
import { plugins } from "$lib/plugins.svelte";
import { setPreviewActive, setTargetHidden } from "./preview";
import type { PrintPlacement } from "$lib/api";

/** Hide → show again: the outro (0.7 s) ends before the target is found again */
const REPLAY_GAP_MS = 900;

/**
 * The editor's stage: the engine's `ArScene` with the mock tracker and the mock stage instead of a camera, and the
 * editor's simulation of the game around it – which spread is open, which targets the "camera" sees, which were
 * found for the first time (the unlock animation plays once per target, *replay* plays it again), and the reader's
 * progress for the book's plugins (`StageProgress`: unlocked targets, book variables – the engine's `api.progress`).
 * The reader's store does none of this here: the editor owns its state. For the Stage panel it keeps the plugins'
 * variables and the last events of the stage (`vars`, `events`).
 */

export type { StageEvent } from "./event-log";
export type PickMode = "entity" | "node" | "target";

/** A placement being edited: the image and where it would be printed (mm) */
export interface GhostPlace {
  imageSrc: string;
  surface: "left" | "right" | "front" | "back";
  x: number;
  y: number;
  width: number;
  height?: number;
}

/** What a click on the stage hit: a target (its printed image, or its entity's node at `path`) */
export interface StagePick {
  targetId: string;
  path: number[];
  /** The printed image was hit, not an entity */
  printed?: boolean;
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
  /** What a click picks (Blender's select mode): the entity (its root), the node under the pointer, or the printed target */
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
  /** The last events of the stage, newest first */
  events = $state<StageEvent[]>([]);
  /** Entities shown with other values than the draft's, by target id (reactive: the panels mark them) */
  overrides = new SvelteMap<string, EntityData>();
  private replayTimer = 0;
  private cleanups: Array<() => void> = [];

  constructor(container: HTMLElement) {
    setPreviewActive(true);
    const scene = new ArScene(container, {
      createTracker: ({ container, options, scene }) => {
        const tracker = new MockTracker(container, options);
        this.mockStage = new MockStage(scene, path => `${base}/${path}`);
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
        const detail = payload === undefined ? "" : typeof payload === "object" && payload !== null
          ? Object.entries(payload as Record<string, unknown>).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")
          : String(payload);
        this.events = logEvent(this.events, { event, detail });
        if (event === "varChanged" || event === "spreadChanged") this.vars = allVars();
      }),
    );
    // Picking is the editor's own: a click (not the one that ends a gizmo drag; the tracker swallows an orbit's)
    // picks by the mode, a right click asks for the menu
    const onClick = (event: MouseEvent) => {
      if (onAppUi(event) || this.gizmo?.recentlyDragged() || this.ghostHandleAt(event.clientX, event.clientY) || !container.contains(event.target as Node)) return;
      this.onPick?.(this.pick(event.clientX, event.clientY));
    };
    const onContext = (event: MouseEvent) => {
      if (onAppUi(event) || !container.contains(event.target as Node)) return;
      event.preventDefault();
      this.onContextMenu?.(this.pick(event.clientX, event.clientY), event.clientX, event.clientY);
    };
    container.addEventListener("click", onClick);
    container.addEventListener("contextmenu", onContext);
    // The placement handles: before the tracker sees the pointer (capture), only while a ghost is shown
    container.addEventListener("pointerdown", this.onGhostPointerDown, true);
    container.addEventListener("pointermove", this.onGhostPointerMove, true);
    container.addEventListener("pointerup", this.onGhostPointerUp, true);
    container.addEventListener("pointercancel", this.onGhostPointerUp, true);
    this.cleanups.push(
      () => container.removeEventListener("click", onClick),
      () => container.removeEventListener("contextmenu", onContext),
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

  /** What lies under a point of the stage (client px) by the pick mode, null for the page or the table */
  pick(clientX: number, clientY: number): StagePick | null {
    const inspection = this.scene.inspect();
    const spread = this.spreadId;
    if (!inspection || !spread) return null;
    const rect = this.container.getBoundingClientRect();
    const point = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(point, inspection.camera);
    // The entities' nodes: every placement group by its object, for the climb from a hit mesh
    const byObject = new Map<Object3D, StagePick>();
    const roots: Object3D[] = [];
    if (this.pickMode !== "target") {
      for (const target of getTargets(spread)) {
        const tree = this.treeOf(target.id);
        if (!tree) continue;
        for (const { path } of entityNodes(tree)) {
          const object = inspection.nodeObject(target.id, path);
          if (object) byObject.set(object, { targetId: target.id, path });
          if (object && !path.length) roots.push(object);
        }
      }
      const hit = this.raycaster.intersectObjects(roots, true).find(h => h.object.visible);
      if (hit) {
        for (let object: Object3D | null = hit.object; object; object = object.parent) {
          const pick = byObject.get(object);
          if (pick) return this.pickMode === "node" ? pick : { targetId: pick.targetId, path: [] };
        }
      }
    }
    // The printed images: the target itself
    const planes = this.tracker?.printedPlanes() ?? [];
    const printed = this.raycaster.intersectObjects(planes, false)[0];
    const targetId = printed?.object.userData.targetId as string | undefined;
    return targetId ? { targetId, path: [], printed: true } : null;
  }

  setPickMode(mode: PickMode): void {
    this.pickMode = mode;
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
    });
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
  }

  /**
   * The selected target (#162): its printed image wears the selection's outline, as a selected node does; null =
   * none (a node is selected, or nothing). The gizmo stays with `selectNode`.
   */
  selectTarget(targetId: string | null): void {
    this.outlinedTarget = targetId;
    this.ensureGizmo();
    this.syncTargetOutline();
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

  /** Ctrl held: the gizmo snaps */
  setSnap(on: boolean): void {
    this.gizmo?.snap(on);
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
  /** A drag of the ghost: the image (move) or its corner (width) */
  private ghostDrag: { kind: "move" | "width"; grabX: number; grabY: number } | null = null;
  /** The form or the panel editing the placement listens: a handle moved it */
  onGhostChange: ((place: { surface: "left" | "right" | "front" | "back"; x: number; y: number; width: number }) => void) | null = null;

  /** Where a target is printed in the book's layout, null when the layout has no place for it */
  printedPlace(targetId: string): PrintPlacement | null {
    return this.tracker?.printedPlace(targetId) ?? null;
  }

  /** Show where a target would be printed (a translucent image on the page with handles); null = none */
  ghost(target: GhostPlace | null): void {
    this.ghostPlace = target;
    this.tracker?.setGhost(target ? { id: "ghost", imageSrc: target.imageSrc, surface: target.surface, x: target.x, y: target.y, width: target.width, height: target.height ?? target.width * 0.75 } : null);
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
    const place = this.ghostPlace;
    // The grab point inside the image (mm), so the image does not jump to the pointer
    const grabX = hit.surface === place.surface ? hit.x - place.x : 0;
    const grabY = hit.y - place.y;
    this.ghostDrag = { kind, grabX, grabY };
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
    const place = this.ghostPlace;
    let next: GhostPlace;
    if (this.ghostDrag.kind === "move") {
      next = { ...place, surface: hit.surface, x: Math.round(hit.x - this.ghostDrag.grabX), y: Math.round(hit.y - this.ghostDrag.grabY) };
    } else {
      // The corner sets the width from the image's left edge (on the image's own page)
      const pageX = hit.surface === place.surface ? hit.x : hit.surface === "right" ? hit.x + 230 : hit.surface === "left" ? hit.x - 230 : hit.x;
      next = { ...place, width: Math.max(10, Math.round(pageX - place.x)) };
    }
    this.ghostPlace = next;
    this.ghost(next);
    this.onGhostChange?.({ surface: next.surface, x: next.x, y: next.y, width: next.width });
    event.preventDefault();
  };

  private onGhostPointerUp = (): void => {
    if (!this.ghostDrag) return;
    this.ghostDrag = null;
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

  /** A new game: every variable of every scope cleared, nothing unlocked, the spread's targets found anew */
  resetNarrative(): void {
    resetVars();
    this.progress.reset();
    this.vars = allVars();
    this.events = [];
    this.replayUnlock();
  }

  async dispose(): Promise<void> {
    window.clearTimeout(this.replayTimer);
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
