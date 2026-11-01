import { SvelteMap } from "svelte/reactivity";
import { resolve } from "$app/paths";
import type { PrintSurface } from "@shared/types/game-config";
import type { EnvironmentData } from "@shared/types/environment";
import { getSpread, getTarget } from "@engine/content/game-config";
import { mirrorPluginRegistry } from "@engine/scene/plugins";
import type { VarScope, VarValue } from "@engine/scene";
import type { ArStatus, EntityData, NodeTimeline, PassData, SpreadFormat } from "@engine/types";
import { nodeAt, removeNode, withNode } from "#lib/values.js";
import type { PrintPlacement } from "#lib/api.js";
import { content } from "#lib/content.svelte.js";
import { plugins } from "#lib/plugins.svelte.js";
import { help } from "#lib/help.svelte.js";
import {
  type ContentSnapshot, FRAME_SANDBOX, type FrameEvent, type FrameInit, FrameRequests, type LayoutSnapshot, readFrameEvent, readFrameReply,
  REMOVED_ENTITY, REMOVED_WIRE, type RunResult, type TimelineSnapshot,
} from "./frame-protocol";
import type { GizmoMode } from "./gizmo";
import type { PickMode, StagePick } from "./pick";
import { applyPreviewSync, getPreview, previewSync, subscribePreview, type ShadingMode } from "./preview";
import type { StageEvent } from "./event-log";
import type { GhostPlace } from "./stage-core.svelte";
import { DEFAULT_PAGE_MM } from "./stage-layout";

export type { StageEvent } from "./event-log";
export type { PickMode, StagePick } from "./pick";
export type { GhostPlace } from "./stage-core.svelte";

/**
 * The editor's stage as the workspace sees it (#234, docs/editor.md "The stage frame"). The stage itself – the engine's
 * `ArScene` over the mock stage, and with it **every plugin of the book and the Code tab's Run** – runs in an iframe
 * sandboxed without `allow-same-origin` (`stage-core.svelte.ts` in `frame-host.svelte.ts`): an opaque origin, so plugin
 * code has no session cookie, no CSRF token, no storage of the editor's and no way into this page. This class is the
 * page's side: it puts the frame into the stage's container, sends it the draft (as text – the frame never asks the
 * API), the preview, the environment and every live edit, and mirrors what the frame reports – its state, the plugins'
 * variables and timeline, the plugin registry (as specs, so the panels read them), the layout and the models' timelines.
 *
 * The live overrides are the page's own (`overrides`, the tree's and the Inspector's source): every change is sent to the
 * frame, and a gizmo drag in the frame only reports the new placement, which the page writes into its override. What
 * the frame sends is checked (`readFrameEvent`) and never reaches the API – saving stays the person's click here. A
 * frame that loads again (a reload, another content base) is given everything again: the draft, the preview, the
 * overrides, the selection, the spread.
 */
export class Stage {
  /** The override that stands for "the entity is removed" (the root went): the stage shows nothing, the Inspector shows no node, Save writes no entity */
  static readonly REMOVED: EntityData = REMOVED_ENTITY;

  status = $state<ArStatus>("idle");
  error = $state<string | null>(null);
  spreadId = $state<string | null>(null);
  /** Targets the tracker reports found right now */
  found = $state<string[]>([]);
  /** A tap on the stage picked something (the Inspector selects it) – or nothing (null) */
  onPick: ((hit: StagePick | null) => void) | null = null;
  /** A right click on the stage: what lies there (null = the page or the table) and where (the page's client px) */
  onContextMenu: ((hit: StagePick | null, clientX: number, clientY: number) => void) | null = null;
  /** The form or the panel editing a placement listens: a handle moved it */
  onGhostChange: ((place: { surface: PrintSurface; x: number; y: number; width: number; height?: number }) => void) | null = null;
  /** What a click picks (Blender's select mode): an entity, the node under the pointer, or a printed target */
  pickMode = $state<PickMode>("entity");
  /** The viewport's shading (stored with the preview settings) */
  shading = $state<ShadingMode>(getPreview().shading);
  /** The environment's world is drawn under the stage now (the toolbar says so) */
  world = $state(false);
  /** The gizmo's mode (the toolbar shows it) */
  gizmoMode = $state<GizmoMode>("translate");
  /** The plugins' variables with their scopes (the Inspector lists them) */
  vars = $state<Array<{ scope: VarScope; name: string; value: VarValue }>>([]);
  /** The stage's event timeline, newest first */
  events = $state<StageEvent[]>([]);
  /** Entities shown with other values than the draft's, by target id (the panels mark them) */
  overrides = new SvelteMap<string, EntityData>();

  private frame: HTMLIFrameElement;
  private requests: FrameRequests;
  private layout = $state.raw<LayoutSnapshot>({ pageFormat: DEFAULT_PAGE_MM, places: {} });
  private timelines: Record<string, TimelineSnapshot> = {};
  private timelineProxies = new Map<string, { clips: string; timeline: NodeTimeline }>();
  /** What a frame that loads (again) is given: the content sent last, and the state the page set */
  private sentContent: ContentSnapshot | null = null;
  private passes: PassData[] | null | undefined = undefined;
  private environment: { environment: EnvironmentData | null; previewing: boolean } | null = null;
  private lookUp = 0;
  private selected: { node: [string | null, number[]]; target: string | null } = { node: [null, []], target: null };
  private ghostPlace: GhostPlace | null = null;
  private snapModifier = false;
  private lastPreview = previewSync();
  /** The frame said it is ready, answered `init`, and has been initialised before (a frame that loads again is given the state anew) */
  private ready = false;
  private initialised = false;
  private initialising = false;
  private initialisedBefore = false;
  /** The frame was replaced here (another content base): its `ready` is expected */
  private replaced = false;
  private cleanups: Array<() => void> = [];
  private disposed = false;

  constructor(private container: HTMLElement) {
    this.frame = this.makeFrame();
    this.requests = new FrameRequests(request => this.frame.contentWindow?.postMessage(request, "*"));
    window.addEventListener("message", this.onMessage);
    this.cleanups.push(
      () => window.removeEventListener("message", this.onMessage),
      subscribePreview(state => {
        this.shading = state.shading;
        const sync = previewSync(state);
        if (sync === this.lastPreview) return;
        this.lastPreview = sync;
        void this.requests.request("preview", [sync]).catch(() => undefined);
      }),
    );
  }

  /** The frame, sandboxed: scripts only, its own opaque origin – first in the container, under the toolbar and the notices */
  private makeFrame(): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.className = "stage-frame";
    frame.title = "Stage";
    frame.setAttribute("sandbox", FRAME_SANDBOX);
    frame.src = resolve("/stage-frame");
    this.container.prepend(frame);
    return frame;
  }

  // ── what the frame sends ──

  private onMessage = (event: MessageEvent): void => {
    if (event.source !== this.frame.contentWindow) return;
    const reply = readFrameReply(event.data);
    if (reply) {
      this.requests.settle(reply);
      return;
    }
    const message = readFrameEvent(event.data);
    if (message) this.handle(message);
  };

  private handle(message: FrameEvent): void {
    switch (message.name) {
      case "ready":
        // A frame that loaded again by itself answers nothing it was asked before (a frame replaced here starts clean)
        if (this.initialisedBefore && !this.replaced) this.requests.close("the stage frame loaded again");
        this.replaced = false;
        this.ready = true;
        this.initialised = false;
        void this.initialise();
        break;
      case "state": {
        const state = message.data;
        this.status = state.status;
        this.error = state.error;
        this.found = state.found;
        this.pickMode = state.pickMode;
        this.world = state.world;
        this.gizmoMode = state.gizmoMode;
        break;
      }
      case "vars":
        this.vars = message.data as typeof this.vars;
        break;
      case "events":
        this.events = message.data;
        break;
      case "registry":
        mirrorPluginRegistry(message.data).forEach(problem => console.warn(`[stage] the registry's ${problem}`));
        plugins.version += 1;
        break;
      case "layout":
        this.layout = message.data;
        break;
      case "timelines":
        this.timelines = message.data;
        break;
      case "pick":
        this.onPick?.(message.data);
        break;
      case "contextMenu": {
        const rect = this.frame.getBoundingClientRect();
        this.onContextMenu?.(message.data.hit, message.data.x + rect.left, message.data.y + rect.top);
        break;
      }
      case "placement": {
        const { targetId, path, placement } = message.data;
        const base = this.overrides.get(targetId) ?? getTarget(targetId)?.entity;
        const node = base && base !== Stage.REMOVED ? nodeAt(base, path) : undefined;
        if (base && node) this.override(targetId, withNode(base, path, { ...node, params: { ...node.params, ...placement } }));
        break;
      }
      case "ghostChange":
        this.onGhostChange?.(message.data);
        break;
      case "preview":
        this.lastPreview = message.data;
        applyPreviewSync(message.data);
        break;
      case "key":
        // The page's shortcuts, as if pressed here (the frame forwards only the keys `FORWARDED_KEYS` lists)
        this.frame.dispatchEvent(new KeyboardEvent(message.data.type, { ...message.data, bubbles: true, cancelable: true }));
        break;
      case "log":
        plugins.addLog(message.data);
        break;
      case "hover":
        help.hover(this.frame);
        break;
    }
  }

  /**
   * The frame is ready: the draft (the newest the content loaded) and the preview go first; then what waited for it.
   * A frame that loads again (a reload, a new frame for another content base) is also given everything the page set:
   * the overrides, the passes, the environment, the modes, the selection, the ghost and the spread.
   */
  private async initialise(): Promise<void> {
    const snapshot = content.snapshot ?? this.sentContent;
    if (!this.ready || this.initialised || this.initialising || !snapshot) return;
    this.initialising = true;
    this.requests.hold();
    try {
      await this.requests.first("init", [{ content: snapshot, preview: previewSync() } satisfies FrameInit]);
    } catch (e) {
      this.status = "error";
      this.error = e instanceof Error ? e.message : String(e);
      return;
    } finally {
      this.initialising = false;
    }
    this.initialised = true;
    this.sentContent = snapshot;
    const opening = this.requests.waiting("open");
    this.requests.open();
    if (!this.initialisedBefore) {
      this.initialisedBefore = true;
      return;
    }
    this.overrides.forEach((entity, targetId) => void this.send("override", [targetId, this.wire(entity)]));
    if (this.passes !== undefined) void this.send("overridePasses", [this.passes]);
    if (this.environment) void this.send("showEnvironment", [this.environment.environment, this.environment.previewing]);
    if (this.lookUp) void this.send("setLookUp", [this.lookUp]);
    void this.send("setPickMode", [this.pickMode]);
    void this.send("setGizmoMode", [this.gizmoMode]);
    void this.send("selectNode", this.selected.node);
    void this.send("selectTarget", [this.selected.target]);
    if (this.ghostPlace) void this.send("ghost", [this.ghostPlace]);
    if (this.spreadId && !opening) await this.send("open", [this.spreadId]);
  }

  /** A request whose failure is logged, not thrown (a fire-and-forget change) */
  private send(method: Parameters<FrameRequests["request"]>[0], args: unknown[] = []): Promise<unknown> {
    return this.requests.request(method, args).catch(e => {
      // A change sent while the workspace closes is no failure
      if (!this.disposed) console.warn(`[stage] ${method}: ${e instanceof Error ? e.message : e}`);
    });
  }

  private wire(entity: EntityData | null): EntityData | typeof REMOVED_WIRE | null {
    return entity === Stage.REMOVED ? REMOVED_WIRE : entity ? ($state.snapshot(entity) as EntityData) : null;
  }

  /**
   * The draft as the content loaded it last goes to the frame before the stage builds from it. A draft whose files
   * moved to another base needs a new frame (its policy names the bases it may load from): the frame is replaced.
   */
  private async syncContent(): Promise<void> {
    const snapshot = content.snapshot;
    if (!snapshot || snapshot === this.sentContent) return;
    // Not initialised yet: `init` takes the newest draft
    if (!this.initialised) return this.initialise();
    try {
      await this.requests.request("content", [snapshot]);
      this.sentContent = snapshot;
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "content-bases-changed") throw e;
      this.reload(snapshot);
    }
  }

  /** A new frame for this content: everything else follows once it is ready */
  private reload(snapshot: ContentSnapshot): void {
    this.requests.close("the stage frame was replaced");
    this.replaced = true;
    this.ready = false;
    this.initialised = false;
    this.sentContent = snapshot;
    this.frame.remove();
    this.frame = this.makeFrame();
  }

  // ── the stage's API for the workspace ──

  /** Show a spread on the stage (the scene runs as soon as it is asked to) */
  async open(spreadId: string): Promise<void> {
    this.spreadId = spreadId;
    this.found = [];
    await this.syncContent();
    await this.requests.request("open", [spreadId]);
  }

  /** The draft changed (a save): the spread is built again from it; overrides stay until cleared */
  async refresh(): Promise<void> {
    await this.syncContent();
    await this.requests.request("refresh");
  }

  /** The current spread's format changed in the draft: the book takes its new shape on the stage at once */
  relayout(): void {
    void this.send("relayout");
  }

  /** Show a target's entity with other values than the content's (live edit), `null` = the content's again; resolves once the frame built it */
  override(targetId: string, entity: EntityData | null): Promise<void> {
    if (entity) this.overrides.set(targetId, entity);
    else this.overrides.delete(targetId);
    return this.send("override", [targetId, this.wire(entity)]).then(() => undefined);
  }

  /** Show the spread with these post-processing passes instead of the draft's (live edit), `null` = the draft's again */
  overridePasses(passes: PassData[] | null): void {
    this.passes = passes;
    void this.send("overridePasses", [passes]);
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
    void this.override(targetId, next);
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
      void this.override(targetId, Stage.REMOVED);
      return [];
    }
    void this.override(targetId, removeNode(base, path));
    return path.slice(0, -1);
  }

  /** The book's environment on the stage (it replaces the HDRI sky box); `previewing` while the Environment tab is open */
  showEnvironment(environment: EnvironmentData | null, previewing = false): void {
    this.environment = { environment, previewing };
    void this.send("showEnvironment", [environment, previewing]);
  }

  /** How far the previewing camera looks up from the book (degrees) */
  setLookUp(degrees: number): void {
    this.lookUp = degrees;
    void this.send("setLookUp", [degrees]);
  }

  /** The gizmo and the light helpers follow the selection (null = none) */
  selectNode(targetId: string | null, path: number[] = []): void {
    this.selected.node = [targetId, [...path]];
    void this.send("selectNode", this.selected.node);
  }

  /** The selected target: its printed image wears the selection's outline; null = none */
  selectTarget(targetId: string | null): void {
    this.selected.target = targetId;
    void this.send("selectTarget", [targetId]);
  }

  setPickMode(mode: PickMode): void {
    this.pickMode = mode;
    void this.send("setPickMode", [mode]);
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode = mode;
    void this.send("setGizmoMode", [mode]);
  }

  /** Shift or Ctrl held (true) or let go: snapping is turned around while it is held */
  setSnapModifier(held: boolean): void {
    if (held === this.snapModifier) return;
    this.snapModifier = held;
    void this.send("setSnapModifier", [held]);
  }

  /**
   * A model node's timeline (the animation component), null for other nodes or before the frame built it – its clips
   * and state as the frame reported them last, its play / pause / seek sent to the frame
   */
  timeline(targetId: string, path: number[]): NodeTimeline | null {
    const key = `${targetId}|${path.join(".")}`;
    const snapshot = this.timelines[key];
    if (!snapshot) {
      this.timelineProxies.delete(key);
      return null;
    }
    const clips = JSON.stringify(snapshot.clips);
    const known = this.timelineProxies.get(key);
    if (known?.clips === clips) return known.timeline;
    const timeline: NodeTimeline = {
      clips: snapshot.clips,
      state: () => (this.timelines[key] ?? snapshot).state,
      play: clip => void this.send("timeline", [targetId, path, "play", clip]),
      pause: () => void this.send("timeline", [targetId, path, "pause"]),
      seek: time => void this.send("timeline", [targetId, path, "seek", time]),
    };
    this.timelineProxies.set(key, { clips, timeline });
    return timeline;
  }

  /** The colour under a point of the stage (CSS px from the container's top left), `#rrggbb` or null */
  sampleColor(x: number, y: number): Promise<string | null> {
    return this.requests.request<string | null>("sampleColor", [x, y]).catch(() => null);
  }

  /** The colours along the stage's bottom edge, in `segments` averaged parts from left to right (empty while nothing renders) */
  sampleBottom(segments: number): Promise<string[]> {
    return this.requests.request<string[]>("sampleBottom", [segments]).catch(() => []);
  }

  /** Where a target is printed in the book's layout, null when the layout has no place for it */
  printedPlace(targetId: string): PrintPlacement | null {
    return this.layout.places[targetId]?.printed ?? null;
  }

  /** Where a target lies on the stage as the content places it (its own print, else the layout's, else the stage's fallback) */
  placeOf(targetId: string): PrintPlacement | null {
    return this.layout.places[targetId]?.place ?? null;
  }

  /** Show where a target would be printed, with handles; null = none (`StageCore.ghost`) */
  ghost(target: GhostPlace | null): void {
    this.ghostPlace = target;
    void this.send("ghost", [target ? $state.snapshot(target) : null]);
  }

  /** The base format (one page, mm) the positions and the grid are counted in */
  pageFormat(): { width: number; height: number } {
    const format = this.layout.pageFormat;
    return format.width > 0 && format.height > 0 ? format : DEFAULT_PAGE_MM;
  }

  /** The current spread's format (the form and the panel offer the right surfaces) */
  format(): SpreadFormat {
    return (this.spreadId ? getSpread(this.spreadId)?.format : undefined) ?? "spread";
  }

  /** Every shown target is locked again, hidden, and found anew: the unlock animation plays */
  replayUnlock(targetIds?: readonly string[]): void {
    void this.send("replayUnlock", targetIds ? [[...targetIds]] : []);
  }

  /** A new game: every variable cleared, nothing unlocked, the timeline empty, the spread's targets found anew */
  resetNarrative(): void {
    void this.send("resetNarrative");
  }

  /** Set (or delete with `null`) a variable by hand, through the plugin API in the frame. The API's refusal as text, null when written */
  async setVar(name: string, value: VarValue | null, scope: VarScope): Promise<string | null> {
    try {
      return await this.requests.request<string | null>("setVar", [name, value, scope]);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** Tap a found target's entity without aiming at it – the reader's tap; false when nothing was tapped */
  tap(targetId: string): Promise<boolean> {
    return this.requests.request<boolean>("tap", [targetId]).catch(() => false);
  }

  /** Empty the timeline (variables and progress stay) */
  clearEvents(): void {
    this.events = [];
    void this.send("clearEvents");
  }

  /** The Code tab's Run in the frame: the transpiled module imported and installed there (`plugin-run.ts`) */
  runPlugin(id: string, code: string): Promise<RunResult> {
    return this.requests.request<RunResult>("runPlugin", [id, code]);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.requests.end();
    this.frame.remove();
  }
}
