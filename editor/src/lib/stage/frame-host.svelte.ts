import { entityNodes, getTargets, loadGameConfiguration } from "@engine/content/game-config";
import { untrack } from "svelte";
import { pluginRegistrySnapshot } from "@engine/scene/plugins";
import { TRIGGER_INFO_URL } from "@engine/utils/trigger-protocol";
import type { VarScope, VarValue } from "@engine/scene";
import type { EntityData, PassData } from "@engine/types";
import type { EnvironmentData } from "@shared/types/environment";
import {
  type ContentSnapshot, eventMessage, type FrameEventName, type FrameEvents, type FrameInit, frameCsp, isForwardedKey, type KeyForward, type LayoutSnapshot,
  LOG_MAX, readFrameRequest, REMOVED_WIRE, type TimelineSnapshot,
} from "./frame-protocol";
import type { GizmoMode } from "./gizmo";
import type { PickMode } from "./pick";
import { runPluginCode } from "./plugin-run";
import { applyPreviewSync, previewSync, subscribePreview } from "./preview";
import { type GhostPlace, StageCore } from "./stage-core.svelte";

/**
 * The stage frame's side (#234, docs/editor.md "The stage frame"): the document at `/editor/stage-frame/`, loaded by the
 * page into an iframe sandboxed without `allow-same-origin`, runs the stage (`StageCore`) – and with it every plugin of
 * the book and the Code tab's Run – and answers the page's requests (`frame-protocol.ts`). Its origin is opaque: no
 * cookie, no storage of the editor's, no access to the page. Before the draft and its plugins load, the document takes a
 * Content Security Policy that lets it reach the content's files and nothing of the API (`frameCsp`). It accepts requests
 * only from its parent at the editor's origin and posts its events only there.
 *
 * Events it sends: the stage's state, the plugins' variables and the timeline, the plugin registry as data (the page
 * mirrors it), the layout of the spread's targets, the model nodes' timelines, picks and the context menu, the gizmo's
 * placements, the placement handles' moves, preview changes, the page's keys while the frame has the focus, and the
 * plugins' log lines for the Code tab.
 */

export interface FrameHostOptions {
  /** The editor's base path (`/editor/`): its scripts and static files */
  appBase: string;
  /** The API's base path (`/api`): only its public `content/` route is reachable */
  apiBase: string;
  /** The dev server's hot-reload socket (dev only), else null */
  devSocket: string | null;
}

/** The content bases a draft names: where its files live (the API's draft URL itself is no file source) */
const contentBasesOf = (content: ContentSnapshot): string[] => (content.assetsBase ? [content.assetsBase] : []);

/** A fetch that answers from the responses the page recorded (the frame never asks the API for the draft) */
const replayFetch = (content: ContentSnapshot): typeof fetch => async input => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const text = content.responses[url.split("?")[0]];
  return text == null ? new Response(null, { status: 404, statusText: "Not Found" }) : new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
};

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

export const startStageFrame = (container: HTMLElement, options: FrameHostOptions): (() => void) => {
  // The page lives at the editor's origin – the frame's URL origin; its own origin is opaque
  const pageOrigin = location.origin;
  const post = <N extends FrameEventName>(name: N, data: FrameEvents[N]) => window.parent.postMessage(eventMessage(name, data), pageOrigin);
  const posted = new Map<string, string>();
  /** Post an event only when its data changed since it was last posted */
  const postIfChanged = <N extends FrameEventName>(name: N, data: FrameEvents[N]) => {
    const text = JSON.stringify(data);
    if (posted.get(name) === text) return;
    posted.set(name, text);
    post(name, data);
  };

  let core: StageCore | null = null;
  let cspKey: string | null = null;
  let lastPreview = previewSync();
  const cleanups: Array<() => void> = [];

  /** The document's policy, once: a meta element cannot widen what an earlier one allows, so another content base needs a new frame */
  const installCsp = (content: ContentSnapshot) => {
    const key = contentBasesOf(content).join(" ");
    if (cspKey !== null) {
      if (key !== cspKey) throw new Error("content-bases-changed");
      return;
    }
    const meta = document.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = frameCsp({
      origin: location.origin, appBase: options.appBase, apiBase: options.apiBase, contentBases: contentBasesOf(content), files: [TRIGGER_INFO_URL], devSocket: options.devSocket,
    });
    document.head.prepend(meta);
    cspKey = key;
  };

  const loadContent = async (content: ContentSnapshot) => {
    installCsp(content);
    const error = await loadGameConfiguration({ baseUrl: content.baseUrl, fetch: replayFetch(content), assetsBase: content.assetsBase || undefined, unknownComponentTypes: "allow" });
    if (error) throw new Error(`${error.msg}${error.details?.[0] ? ` – ${error.details[0]}` : ""}`);
  };

  const stage = (): StageCore => {
    if (!core) throw new Error("the stage frame is not initialised");
    return core;
  };

  const layout = (): LayoutSnapshot => {
    const s = core;
    const spread = s?.spreadId;
    const places: LayoutSnapshot["places"] = {};
    if (s && spread) getTargets(spread).forEach(target => { places[target.id] = { printed: s.printedPlace(target.id), place: s.placeOf(target.id) }; });
    return { pageFormat: s?.pageFormat() ?? { width: 0, height: 0 }, places };
  };

  const timelines = (): Record<string, TimelineSnapshot> => {
    const s = core;
    const spread = s?.spreadId;
    const result: Record<string, TimelineSnapshot> = {};
    if (!s || !spread || s.status !== "running") return result;
    getTargets(spread).forEach(target => {
      const tree = s.treeOf(target.id);
      if (!tree) return;
      entityNodes(tree).forEach(({ path }) => {
        const timeline = s.timeline(target.id, path);
        if (timeline) result[`${target.id}|${path.join(".")}`] = { clips: timeline.clips.map(c => ({ name: c.name, duration: c.duration })), state: timeline.state() };
      });
    });
    return result;
  };

  /** After a request: the registry (a plugin loaded or ran, a node built or failed) and the layout */
  const sync = () => {
    if (!core) return;
    postIfChanged("registry", pluginRegistrySnapshot());
    postIfChanged("layout", layout());
  };

  const start = async ({ content, preview }: FrameInit) => {
    if (core) return;
    await loadContent(content);
    lastPreview = previewSync(JSON.parse(preview));
    applyPreviewSync(preview);
    const s = new StageCore(container);
    core = s;
    s.onPick = hit => post("pick", hit);
    s.onContextMenu = (hit, x, y) => post("contextMenu", { hit, x, y });
    s.onGhostChange = place => post("ghostChange", place);
    s.onPlacement = (selection, placement) => post("placement", { targetId: selection.targetId, path: [...selection.path], placement });
    cleanups.push($effect.root(() => {
      $effect(() => {
        post("state", {
          status: s.status, error: s.error, spreadId: s.spreadId, found: [...s.found], pickMode: s.pickMode, shading: s.shading, world: s.world, gizmoMode: s.gizmoMode,
        });
        // The declared plugins registered while the spread loaded
        if (s.status === "running") untrack(sync);
      });
      $effect(() => post("vars", $state.snapshot(s.vars) as FrameEvents["vars"]));
      $effect(() => post("events", $state.snapshot(s.events)));
    }));
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      postIfChanged("timelines", timelines());
      postIfChanged("layout", layout());
    });
    cleanups.push(() => cancelAnimationFrame(frame));
  };

  /** What each request does; its value is the reply's */
  const methods: Record<string, (...args: never[]) => unknown> = {
    init: (init: FrameInit) => start(init),
    content: (content: ContentSnapshot) => loadContent(content),
    open: (spreadId: string) => stage().open(spreadId),
    refresh: () => stage().refresh(),
    relayout: () => stage().relayout(),
    override: (targetId: string, entity: EntityData | typeof REMOVED_WIRE | null) => stage().override(targetId, entity === REMOVED_WIRE ? StageCore.REMOVED : entity),
    overridePasses: (passes: PassData[] | null) => stage().overridePasses(passes),
    selectNode: (targetId: string | null, path: number[]) => stage().selectNode(targetId, path),
    selectTarget: (targetId: string | null) => stage().selectTarget(targetId),
    setPickMode: (mode: PickMode) => stage().setPickMode(mode),
    setGizmoMode: (mode: GizmoMode) => stage().setGizmoMode(mode),
    setSnapModifier: (held: boolean) => stage().setSnapModifier(held),
    showEnvironment: (environment: EnvironmentData | null, previewing: boolean) => stage().showEnvironment(environment, previewing),
    setLookUp: (degrees: number) => stage().setLookUp(degrees),
    ghost: (place: GhostPlace | null) => stage().ghost(place),
    preview: (sync: string) => {
      lastPreview = previewSync(JSON.parse(sync));
      applyPreviewSync(sync);
    },
    replayUnlock: (targetIds?: string[]) => stage().replayUnlock(targetIds),
    resetNarrative: () => stage().resetNarrative(),
    clearEvents: () => stage().clearEvents(),
    setVar: (name: string, value: VarValue | null, scope: VarScope) => stage().setVar(name, value, scope),
    tap: (targetId: string) => stage().tap(targetId),
    sampleColor: (x: number, y: number) => stage().sampleColor(x, y),
    sampleBottom: (segments: number) => stage().sampleBottom(segments),
    timeline: (targetId: string, path: number[], action: "play" | "pause" | "seek", value?: string | number) => {
      const timeline = stage().timeline(targetId, path);
      if (action === "play") timeline?.play(typeof value === "string" ? value : undefined);
      else if (action === "pause") timeline?.pause();
      else if (typeof value === "number") timeline?.seek(value);
      postIfChanged("timelines", timelines());
    },
    runPlugin: (id: string, code: string) => runPluginCode(id, code),
  };

  const onMessage = async (event: MessageEvent) => {
    // Only the editor's page drives the stage
    if (event.source !== window.parent || event.origin !== pageOrigin) return;
    const request = readFrameRequest(event.data);
    if (!request) return;
    const reply = { osct: request.osct, kind: "reply" as const, id: request.id };
    try {
      const value = await (methods[request.method] as (...args: unknown[]) => unknown)(...request.args);
      sync();
      window.parent.postMessage({ ...reply, ok: true, value: value === undefined ? null : value }, pageOrigin);
    } catch (error) {
      window.parent.postMessage({ ...reply, ok: false, error: error instanceof Error ? error.message : String(error) }, pageOrigin);
    }
  };
  window.addEventListener("message", onMessage);
  cleanups.push(() => window.removeEventListener("message", onMessage));

  // The preview the frame changed itself (an orbit dragged, a target hidden for a replay) goes to the page, which stores it
  cleanups.push(subscribePreview(state => {
    const sync = previewSync(state);
    if (sync === lastPreview) return;
    lastPreview = sync;
    post("preview", sync);
  }));

  // The page's shortcuts while the frame has the focus: only the keys it may forward
  const onKey = (event: KeyboardEvent) => {
    const key: KeyForward = {
      type: event.type as KeyForward["type"], key: event.key, code: event.code, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey,
      metaKey: event.metaKey, repeat: event.repeat,
    };
    if (isForwardedKey(key)) post("key", key);
  };
  const onBlur = () => core?.setSnapModifier(false);
  // The page's Info view shows the stage's help while the pointer is on it
  const onEnter = () => post("hover", null);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", onBlur);
  document.documentElement.addEventListener("pointerenter", onEnter);
  cleanups.push(() => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("blur", onBlur);
    document.documentElement.removeEventListener("pointerenter", onEnter);
  });

  // The plugins' lines for the Code tab: their `api.log` and the engine's lines about them, and what nobody caught
  const log = (level: "info" | "warn" | "error", args: unknown[]) => {
    if (typeof args[0] !== "string" || !args[0].startsWith("[plugin")) return;
    post("log", { level, text: args.map(textOf).join(" ").slice(0, LOG_MAX) });
  };
  const original = { info: console.info, warn: console.warn, error: console.error };
  (["info", "warn", "error"] as const).forEach(level => {
    console[level] = (...args: unknown[]) => {
      original[level].apply(console, args);
      log(level, args);
    };
  });
  const onError = (event: ErrorEvent) => post("log", { level: "error", text: `Uncaught ${textOf(event.error ?? event.message)}`.slice(0, LOG_MAX) });
  const onRejection = (event: PromiseRejectionEvent) => post("log", { level: "error", text: `Uncaught (in promise) ${textOf(event.reason)}`.slice(0, LOG_MAX) });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  cleanups.push(() => {
    Object.assign(console, original);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  });

  post("ready", null);
  return () => {
    cleanups.forEach(cleanup => cleanup());
    void core?.dispose();
    core = null;
  };
};
