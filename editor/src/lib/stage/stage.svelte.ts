import { SvelteMap } from "svelte/reactivity";
import type { SurfacePlace, TargetPlace } from "@shared/types/game-config";
import type { EnvironmentData } from "@shared/types/environment";
import type { ExperienceAppearance, Moment } from "@shared/types/appearance";
import { getPlugins, getTarget } from "@engine/content/game-config";
import { keepPlugin, pluginRegistryRevision, resetPlugins } from "@engine/scene/plugins";
import type { HandRun, RuleHome, VarScope, VarValue } from "@engine/scene";
import type { EntityData, NodeTimeline, PassData } from "@engine/types";
import { nodeAt, removeNode, withNode } from "#lib/values.js";
import { plugins } from "#lib/plugins.svelte.js";
import { adoptRecordedSpecs } from "#lib/plugins/recorded.js";
import { LOG_MAX, NO_ANSWER, REMOVED_ENTITY, type RunResult, type SurfacePick, type SurfaceSnapshot } from "./stage-types";
import type { SurfaceReferences } from "./surfaces";
import type { GizmoPlacement, StageTool } from "./gizmo";
import type { PickFilter, StagePick } from "./pick";
import { runPluginCode } from "./plugin-run";
import { type GhostPlace, StageCore } from "./stage-core.svelte";

export type { StageEvent } from "./event-log";
export type { PickFilter, PickKind, StagePick } from "./pick";
export type { GhostPlace } from "./stage-core.svelte";

/** A console argument as text for the Code tab's log */
const textOf = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * The editor's stage as the workspace sees it (#340, docs/editor.md "The stage"). It runs **in the editor's own page**:
 * the engine's `ArScene` over the mock stage (`StageCore`), and with it every plugin of the experience and the Code tab's
 * Run – in a layer of its own at the bottom of the stage's container (`.stage-host`), under the toolbar and the notices.
 * The stage frame of #234 (an iframe without `allow-same-origin`, its own policy, a postMessage protocol) is gone: plugin
 * code acts with the signed-in editor's session now, which is why the workspace asks before it runs code someone else
 * saved last (`plugin-guard.svelte.ts`; the ids it keeps off go into `keptPlugins`).
 *
 * The stage reads the draft the page loaded (the engine's content runtime is one per page) – nothing is copied. The live
 * overrides are the page's own (`overrides`, the tree's and the Inspector's source): every change goes to the stage, and
 * a gizmo drag writes the new placement of the node the page selected into its override. An override is an edit the
 * draft does not hold yet: the workspace saves it by itself (`tree-autosave.ts`) and `adopt` ends it.
 *
 * The plugins' lines (their `api.log`, the engine's lines about them, what they threw and nobody caught) go to the Code
 * tab and the Log tab (`plugins.addLog`) while the stage lives. Leaving the workspace empties the plugin registry
 * (`resetPlugins`), so the next experience starts with none of this one's code.
 */
export class Stage {
  /** The override that stands for "the entity is removed" (the root went): the stage shows nothing, the Inspector shows no node, the draft gets no entity */
  static readonly REMOVED: EntityData = REMOVED_ENTITY;

  /** A tap on the stage picked something (the Inspector selects it) – or nothing (null) */
  onPick: ((hit: StagePick | null) => void) | null = null;
  /** A right click on the stage: what lies there (null = the page or the table) and where (the page's client px) */
  onContextMenu: ((hit: StagePick | null, clientX: number, clientY: number) => void) | null = null;
  /** The form or the panel editing a placement listens: a handle moved it */
  onGhostChange: ((place: TargetPlace) => void) | null = null;
  /** A tap on the stage hit a surface of the open scene (#314: the Surface mode selects by it), mm from its top left corner – or none */
  onSurfacePick: ((hit: SurfacePick) => void) | null = null;
  /** A drag of the surface gizmo ended (#314): the surface's new place in its scene – the page saves it */
  onSurfacePlace: ((surfaceId: string, place: Required<SurfacePlace>) => void) | null = null;
  /** Entities shown with other values than the draft's, by target id: edits not saved yet (the panels mark them) */
  overrides = new SvelteMap<string, EntityData>();
  /** The Live switch (#269): on, the entities move by themselves; off, their clock holds (the looks play on) */
  live = $state(true);
  /**
   * The stage starts: the Code tab's saved sources are installed now (#269, `plugins.autoLoad`) – **before the first scene
   * builds**, so its nodes find the components, node types, materials and looks they name (no "No component … registered"
   * and a rebuild after). The first scene waits for it; a source that fails or hangs is the auto-load's to report.
   */
  onStarted: (() => Promise<void> | void) | null = null;
  /**
   * The plugin ids whose content module the stage never loads, asked for once before the first scene opens: the Code
   * tab's saved sources (theirs run instead, #269 – a declaration built against an older plugin API raises no refusal)
   * and the plugins the guard keeps off (#340)
   */
  keptPlugins: () => string[] = () => [];

  private core: StageCore;
  private host: HTMLDivElement;
  private selectedNode: [string | null, number[]] = [null, []];
  private surfaceGizmoAsked: { surfaceId: string | null; mode: "translate" | "rotate" } = { surfaceId: null, mode: "translate" };
  private cleanups: Array<() => void> = [];
  private disposed = false;
  private starting: Promise<void> | null = null;
  private asked = $state<string | null>(null);
  private bumping = false;
  /** The registry's revision the panels read last (`pluginRegistryRevision`) */
  private seenRevision = pluginRegistryRevision();

  /** `core` builds the stage in its layer – the engine's `StageCore` (a test gives a stand-in) */
  constructor(container: HTMLElement, core: (host: HTMLElement) => StageCore = host => new StageCore(host)) {
    this.host = document.createElement("div");
    this.host.className = "stage-host";
    container.prepend(this.host);
    const c = (this.core = core(this.host));
    c.onPick = hit => this.onPick?.(hit);
    c.onContextMenu = (hit, x, y) => this.onContextMenu?.(hit, x, y);
    c.onGhostChange = place => this.onGhostChange?.(place);
    c.onSurfacePick = hit => this.onSurfacePick?.(hit);
    // Only the surface the page put the gizmo on
    c.onSurfacePlace = (surfaceId, place) => {
      if (surfaceId === this.surfaceGizmoAsked.surfaceId) this.onSurfacePlace?.(surfaceId, place);
    };
    c.onPlacement = (selection, placement) => this.placed(selection.targetId, [...selection.path], placement);
    this.cleanups.push(this.captureLogs(), $effect.root(() => {
      // The declared plugins registered while the scene loaded: the panels read the registry again
      $effect(() => {
        if (c.status === "running") this.registryChanged();
      });
    }));
  }

  // ── what the stage is (the stage's own state, reactive) ──

  get status() { return this.core.status; }
  get error() { return this.core.error; }
  /** The scene asked for – before the stage opened it too (the first open waits for the experience's code) */
  get sceneId() { return this.asked ?? this.core.sceneId; }
  /** Targets the tracker reports found right now */
  get found() { return this.core.found; }
  /** The subtitle line of the video that plays on the stage (English, or the first language its video has) */
  get subtitle() { return this.core.subtitle; }
  /** What a click may pick – the select tool's filters: entities, targets, models, nodes; none on = anything */
  get pickFilter() { return this.core.pickFilter; }
  /** The viewport's shading (stored with the preview settings) */
  get shading() { return this.core.shading; }
  /** The environment's world is drawn under the stage now (the toolbar says so) */
  get world() { return this.core.world; }
  /** The tool in hand (the toolbar shows it): select – no gizmo – or a gizmo mode */
  get tool() { return this.core.tool; }
  /** The plugins' variables with their scopes (the Inspector lists them) */
  get vars() { return this.core.vars; }
  /** The stage's event timeline, newest first */
  get events() { return this.core.events; }

  /**
   * The registry may have changed (a plugin loaded, a node built or failed): when it did (its revision moved), the panels
   * read it again – once, after the change. An edit that changed nothing of it costs the panels nothing.
   */
  private registryChanged(): void {
    if (this.bumping) return;
    this.bumping = true;
    queueMicrotask(() => {
      this.bumping = false;
      const revision = pluginRegistryRevision();
      if (revision === this.seenRevision) return;
      this.seenRevision = revision;
      plugins.version += 1;
    });
  }

  /** A gizmo drag moved the selected node: the placement goes into the page's override (the gizmo sits on that node alone) */
  private placed(targetId: string, path: number[], placement: GizmoPlacement): void {
    const [selectedTarget, selectedPath] = this.selectedNode;
    if (targetId !== selectedTarget || path.join(".") !== selectedPath.join(".")) return;
    const base = this.overrides.get(targetId) ?? getTarget(targetId)?.entity;
    const node = base && base !== Stage.REMOVED ? nodeAt(base, path) : undefined;
    if (base && node) void this.override(targetId, withNode(base, path, { ...node, params: { ...node.params, ...placement } }));
  }

  /**
   * The plugins' lines for the Code tab and the Log tab while the stage lives: their `api.log` and the engine's lines
   * about them (`[plugin …` / `[plugins]`), and what a plugin's module threw that nobody caught – a module the Code tab
   * ran (a `blob:` URL) or a declared plugin's – with the timeline's clocks, so the Log tab places them among the events
   */
  private captureLogs(): () => void {
    const add = (level: "info" | "warn" | "error", text: string) =>
      plugins.addLog({ level, text: text.slice(0, LOG_MAX), t: performance.now(), at: this.core.elapsed() });
    const original = { info: console.info, warn: console.warn, error: console.error };
    (["info", "warn", "error"] as const).forEach(level => {
      console[level] = (...args: unknown[]) => {
        original[level].apply(console, args);
        if (typeof args[0] === "string" && args[0].startsWith("[plugin")) add(level, args.map(textOf).join(" "));
      };
    });
    const fromPlugin = (where: string) => where.includes("blob:") || getPlugins().some(p => !!p.src && where.includes(p.src));
    const onError = (event: ErrorEvent) => {
      const stack = event.error instanceof Error ? (event.error.stack ?? "") : "";
      if (fromPlugin(`${event.filename ?? ""} ${stack}`)) add("error", `Uncaught ${textOf(event.error ?? event.message)}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof Error && fromPlugin(event.reason.stack ?? "")) add("error", `Uncaught (in promise) ${textOf(event.reason)}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      Object.assign(console, original);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }

  /**
   * Before the first scene opens, once (every open waits for it): the kept plugins are marked before their content modules
   * could load, then `onStarted` installs the saved sources – the frame of #234 did the same before its stage existed
   */
  private start(): Promise<void> {
    this.starting ??= (async () => {
      this.keptPlugins().forEach(id => keepPlugin(id));
      try {
        await this.onStarted?.();
      } catch (e) {
        console.warn(`[stage] the experience's code did not load: ${e instanceof Error ? e.message : e}`);
      }
    })();
    return this.starting;
  }

  // ── the stage's API for the workspace ──

  /** Show a scene on the stage (the scene runs as soon as it is asked to) */
  async open(sceneId: string): Promise<void> {
    this.asked = sceneId;
    await this.start();
    if (this.disposed) return;
    await this.core.open(sceneId);
    this.registryChanged();
  }

  /** The draft changed (a save): the scene is built again from it; overrides stay until cleared */
  async refresh(): Promise<void> {
    await this.core.refresh();
    this.registryChanged();
  }

  /** The open scene's surfaces changed in the draft: the stage lays them out again at once */
  relayout(): void {
    this.core.relayout();
  }

  /**
   * The surfaces' reference images (#314) by scene id and surface id – `{ url, fit }` from the scenes overview's
   * `surfaces[].reference`; the open scene's lie on its surfaces at once
   */
  setSurfaceReferences(references: SurfaceReferences): void {
    this.core.setSurfaceReferences(references);
  }

  /** The surfaces marked on the stage (#314, the Surface mode): `outlined` thin, `highlighted` the selected one – ids of the open scene's surfaces */
  setSurfaceMarks(outlined: readonly string[], highlighted: string | null): void {
    this.core.setSurfaceMarks([...outlined], highlighted);
  }

  /** The surface gizmo asked for (#314): shown in the Surface mode on that surface of a free scene */
  setSurfaceGizmo(surfaceId: string | null, mode: "translate" | "rotate" = "translate"): void {
    if (this.surfaceGizmoAsked.surfaceId === surfaceId && this.surfaceGizmoAsked.mode === mode) return;
    this.surfaceGizmoAsked = { surfaceId, mode };
    this.core.setSurfaceGizmo(surfaceId, mode);
  }

  /** The open scene's surfaces as the stage lays them (#314): their ids and sizes; `flat` = on the table */
  surfaces(): SurfaceSnapshot[] {
    return this.core.surfaceFrames().map(f => ({ id: f.id, widthMm: f.widthMm, heightMm: f.heightMm, flat: f.flat }));
  }

  /** Show a target's entity with other values than the content's (live edit), `null` = the content's again; resolves once the stage built it */
  async override(targetId: string, entity: EntityData | null): Promise<void> {
    if (entity) this.overrides.set(targetId, entity);
    else this.overrides.delete(targetId);
    this.core.override(targetId, entity);
    this.registryChanged();
  }

  /**
   * The draft holds a target's live tree now (its save ran): the stage keeps showing the tree – no rebuild, clips and
   * videos play on – and the tree is no override any more. A tree edited again meanwhile stays one.
   */
  async adopt(targetId: string, saved: EntityData): Promise<void> {
    if (this.overrides.get(targetId) === saved) this.overrides.delete(targetId);
  }

  /** Show the scene with these post-processing passes instead of the draft's (live edit), `null` = the draft's again */
  overridePasses(passes: PassData[] | null): void {
    this.core.overridePasses(passes);
  }

  /**
   * Play these looks instead of the draft's (live edit, #265): the experience's `appearance` as the panel holds it – `null` =
   * the experience names none, the default look plays everywhere
   */
  overrideAppearance(appearance: ExperienceAppearance | null): void {
    this.core.overrideAppearance({ appearance });
  }

  /** Play a moment's look on the stage's shown targets: the first find, a later find, the page lost */
  playMoment(moment: Moment): void {
    this.core.playMoment(moment);
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

  /** Change a target's tree (live, saved by itself): the tree's moves, indent, outdent (#163) */
  editTree(targetId: string, edit: (tree: EntityData) => EntityData | null): boolean {
    const base = this.treeOf(targetId);
    const next = base ? edit(base) : null;
    if (!next) return false;
    void this.override(targetId, next);
    return true;
  }

  /**
   * Remove a node of a target's entity (live, saved by itself): a child goes with its children, the root leaves the
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

  /** The experience's environment on the stage (it replaces the HDRI sky box); `previewing` while the Environment tab is open */
  showEnvironment(environment: EnvironmentData | null, previewing = false): void {
    this.core.showEnvironment(environment, previewing);
  }

  /** How far the previewing camera looks up from the experience (degrees) */
  setLookUp(degrees: number): void {
    this.core.setLookUp(degrees);
  }

  /** The gizmo and the light helpers follow the selection (null = none) */
  selectNode(targetId: string | null, path: number[] = []): void {
    this.selectedNode = [targetId, [...path]];
    this.core.selectNode(targetId, [...path]);
  }

  /** The selected target: its printed image wears the selection's outline; null = none */
  selectTarget(targetId: string | null): void {
    this.core.selectTarget(targetId);
  }

  setPickFilter(filter: PickFilter): void {
    this.core.setPickFilter([...filter]);
  }

  setTool(tool: StageTool): void {
    this.core.setTool(tool);
  }

  /** Shift or Ctrl held (true) or let go: snapping is turned around while it is held */
  setSnapModifier(held: boolean): void {
    this.core.setSnapModifier(held);
  }

  /** A model node's timeline (the animation component), null for other nodes or before the stage built it */
  timeline(targetId: string, path: number[]): NodeTimeline | null {
    return this.core.timeline(targetId, path);
  }

  /** The colour under a point of the stage (CSS px from the container's top left), `#rrggbb` or null */
  async sampleColor(x: number, y: number): Promise<string | null> {
    try {
      return this.core.sampleColor(x, y);
    } catch {
      return null;
    }
  }

  /** Where a target lies on the stage as the content places it (its own place, else the stage's fallback) */
  placeOf(targetId: string): TargetPlace | null {
    return this.core.placeOf(targetId);
  }

  /** Show where a target would be printed, with handles; null = none (`StageCore.ghost`) */
  ghost(target: GhostPlace | null): void {
    this.core.ghost(target);
  }

  /** Every shown target is locked again, hidden, and found anew: the unlock animation plays */
  replayUnlock(targetIds?: readonly string[]): void {
    this.core.replayUnlock(targetIds);
  }

  /** A new game: every variable cleared, nothing unlocked, the timeline empty, the scene's targets found anew */
  resetNarrative(): void {
    this.core.resetNarrative();
  }

  /** The Live switch (#269): off holds the entities' clock on the stage, on lets it run */
  setLive(live: boolean): void {
    this.live = live;
    this.core.setLive(live);
  }

  /** Set (or delete with `null`) a variable by hand, through the plugin API. The API's refusal as text, null when written */
  async setVar(name: string, value: VarValue | null, scope: VarScope): Promise<string | null> {
    return this.core.setVar(name, value, scope);
  }

  /** Fire an event on the bus by hand (the Logic panel, #334): rules and plugins listen to it, the Log marks it *by hand*. The refusal as text, null when fired */
  fire(event: string, payload?: Record<string, unknown>): string | null {
    return this.core.fire(event, payload);
  }

  /** Run one rule on the stage as if its event had come – its condition applies (the Logic panel, #334) */
  runRule(home: RuleHome, rule: number): HandRun | "stopped" {
    return this.core.runRule(home, rule);
  }

  /** Tap a found target's entity without aiming at it – the reader's tap; false when nothing was tapped */
  async tap(targetId: string): Promise<boolean> {
    return this.core.tap(targetId);
  }

  /** Empty the timeline (variables and progress stay) */
  clearEvents(): void {
    this.core.clearEvents();
  }

  /**
   * The Code tab's Run: the transpiled module imported and installed in the stage's registry (`plugin-run.ts`). With
   * `timeoutMs`, a module that does not settle in time is a failed run, not a wait for ever (code that blocks the page
   * blocks it – the auto-load's mark skips that source at the next open, `plugins.autoLoad`).
   */
  runPlugin(id: string, code: string, timeoutMs?: number): Promise<RunResult> {
    const run = runPluginCode(id, code);
    if (!timeoutMs) return run;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<RunResult>(resolve => {
      timer = setTimeout(() => resolve({ ok: false, error: `${NO_ANSWER} within ${Math.round(timeoutMs / 1000)} s` }), timeoutMs);
    });
    return Promise.race([run, late]).finally(() => clearTimeout(timer));
  }

  /** The workspace closes: the stage goes, the plugins' lines stop, the registry is emptied (the draft's recorded specs stay known) */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    await this.core.dispose();
    this.host.remove();
    resetPlugins();
    adoptRecordedSpecs(getPlugins());
    plugins.version += 1;
  }
}
