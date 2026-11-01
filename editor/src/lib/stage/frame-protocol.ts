import type { PluginRegistrySnapshot } from "@engine/scene/plugins";
import type { ArStatus, EntityData } from "@engine/types";
import type { PrintPlacement } from "@shared/types/game-config";
import { PRINT_SURFACES } from "@shared/types/game-config";
import { isObject } from "@shared/guards/primitives";
import { GIZMO_KEYS, GIZMO_MODES, type GizmoMode, type GizmoPlacement } from "./gizmo";
import type { PickMode, StagePick } from "./pick";
import { SHADING_MODES, type ShadingMode } from "./preview";
import type { StageEvent } from "./event-log";

/**
 * The stage frame's message protocol (#234, docs/editor.md "The stage frame"). The editor's stage – the engine's
 * `ArScene` with the book's plugins – runs in an iframe sandboxed without `allow-same-origin`: an opaque origin, so plugin
 * code there has no cookie, no storage of the editor's and no way into the page. The page and the frame talk only
 * through `postMessage`:
 *
 * - **requests** (page → frame): `{ osct: "stage", kind: "request", id, method, args }` – the methods of `FRAME_METHODS`;
 *   the frame answers each with a **reply** `{ osct: "stage", kind: "reply", id, ok, value | error }`.
 * - **events** (frame → page): `{ osct: "stage", kind: "event", name, data }` – what the stage did (state, a pick, a
 *   gizmo drag, the registry, …). The page reads every event through `readFrameEvent`, which checks its shape: whatever
 *   plugin code in the frame posts, the page acts only on well-formed events, and none of them reaches the API – a save
 *   is always the person's own click in the page.
 *
 * What crosses carries no session and no API access: the draft goes in as text (the page fetched it), media load from
 * public URLs, and the frame's document allows requests to no other origin than the content's (`frameCsp`).
 */

/** The frame's sandbox: scripts, nothing else – no `allow-same-origin` (the origin stays opaque), forms, popups or navigation of the page */
export const FRAME_SANDBOX = "allow-scripts";

/** Marks the stage's messages among others a window may receive */
export const MESSAGE_TAG = "stage";

/**
 * The override that stands for "the entity is removed" (the root went): the stage shows nothing, the Inspector shows no
 * node, Save writes no entity. Compared by reference in each realm; it crosses the frame's boundary as `REMOVED_WIRE`.
 */
export const REMOVED_ENTITY: EntityData = Object.freeze({ type: "group", assets: [] }) as EntityData;
export const REMOVED_WIRE = "removed";

/** The draft as the page loaded it: the content base, where its files live and the responses of the base's files (by path, null = not there) */
export interface ContentSnapshot {
  baseUrl: string;
  assetsBase: string | null;
  responses: Record<string, string | null>;
}

/** The preview settings and hidden targets the page and the frame keep in step, as `previewSync` writes them (`preview.ts`) */
export type PreviewSync = string;

/** What the frame needs to start: the draft and the preview */
export interface FrameInit {
  content: ContentSnapshot;
  preview: PreviewSync;
}

/** The stage's state as the page shows it */
export interface StageState {
  status: ArStatus;
  error: string | null;
  spreadId: string | null;
  found: string[];
  pickMode: PickMode;
  shading: ShadingMode;
  world: boolean;
  gizmoMode: GizmoMode;
}

/** Where the stage lays the spread's targets out: the page format (mm) and per target its layout place and its place */
export interface LayoutSnapshot {
  pageFormat: { width: number; height: number };
  places: Record<string, { printed: PrintPlacement | null; place: PrintPlacement | null }>;
}

/** A model node's timeline as the frame sees it: its clips and where it is */
export interface TimelineSnapshot {
  clips: Array<{ name: string; duration: number }>;
  state: { clip: string; time: number; playing: boolean; duration: number };
}

/** A key the page acts on while the frame has the focus (the page's shortcuts) – nothing that saves or publishes */
export interface KeyForward {
  type: "keydown" | "keyup";
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

/** A line of the book's code for the Code tab: a plugin's `api.log`, a plugin's error on the stage */
export interface FrameLog {
  level: "info" | "warn" | "error";
  text: string;
}

/** The result of running transpiled plugin code in the frame */
export type RunResult = { ok: true; types: string[] } | { ok: false; error: string };

/** Every event the frame sends, by name, with its data */
export interface FrameEvents {
  /** The frame loaded (again): the page initialises it */
  ready: null;
  state: StageState;
  vars: Array<{ scope: string; name: string; value: unknown }>;
  events: StageEvent[];
  registry: PluginRegistrySnapshot;
  layout: LayoutSnapshot;
  timelines: Record<string, TimelineSnapshot>;
  pick: StagePick | null;
  contextMenu: { hit: StagePick | null; x: number; y: number };
  /** The gizmo moved the selected node: the page writes the placement into its override */
  placement: { targetId: string; path: number[]; placement: GizmoPlacement };
  ghostChange: { surface: PrintPlacement["surface"]; x: number; y: number; width: number; height?: number };
  /** The frame changed the preview (an orbit, a hidden target): the page stores it */
  preview: PreviewSync;
  key: KeyForward;
  log: FrameLog;
  /** The pointer came onto the stage: the page's Info view shows the stage's help (the page sees no pointer inside the frame) */
  hover: null;
}

export type FrameEventName = keyof FrameEvents;
export type FrameEvent = { [N in FrameEventName]: { name: N; data: FrameEvents[N] } }[FrameEventName];

/** The methods the frame answers (`frame-host.svelte.ts`) */
export const FRAME_METHODS = [
  "init", "content", "open", "refresh", "relayout", "override", "overridePasses", "selectNode", "selectTarget", "setPickMode", "setGizmoMode",
  "setSnapModifier", "showEnvironment", "setLookUp", "ghost", "preview", "replayUnlock", "resetNarrative", "clearEvents", "setVar", "tap",
  "sampleColor", "sampleBottom", "timeline", "runPlugin",
] as const;
export type FrameMethod = (typeof FRAME_METHODS)[number];

export interface FrameRequest { osct: typeof MESSAGE_TAG; kind: "request"; id: number; method: FrameMethod; args: unknown[] }
export interface FrameReply { osct: typeof MESSAGE_TAG; kind: "reply"; id: number; ok: boolean; value?: unknown; error?: string }

// ── checks: what a message must look like before anyone acts on it ──

const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isPath = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 64 && value.every(i => Number.isInteger(i) && i >= 0);
const isId = (value: unknown): value is string => isString(value) && value.length > 0 && value.length <= 200;
const isVector = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
const AR_STATUSES: readonly ArStatus[] = ["idle", "loading", "ready", "starting", "running", "paused", "error"];
const PICK_MODES: readonly PickMode[] = ["entity", "node", "target"];
const LOG_LEVELS: readonly FrameLog["level"][] = ["info", "warn", "error"];
/** How long a log line may be (a plugin logging a whole buffer is cut) */
export const LOG_MAX = 2000;

const isPick = (value: unknown): value is StagePick =>
  isObject(value) && isId(value.targetId) && isPath(value.path) && (value.printed === undefined || typeof value.printed === "boolean");

const isPlacement = (value: unknown): value is PrintPlacement =>
  isObject(value) && (PRINT_SURFACES as readonly unknown[]).includes(value.surface) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.width)
  && (value.height === undefined || isFiniteNumber(value.height));

/**
 * The keys a frame may forward to the page: Shift and Control (snapping turned around), ← → (the spreads), the gizmo's
 * mode keys, Delete / Backspace (the selected node, live – Save stays the person's click), Escape. Nothing else
 * reaches the page's shortcuts.
 */
export const FORWARDED_KEYS: readonly string[] = ["Shift", "Control", "ArrowLeft", "ArrowRight", "Delete", "Backspace", "Escape", ...Object.keys(GIZMO_KEYS)];

/** A key the frame may forward (letters case-insensitively; never with Ctrl, Meta or Alt held unless it is a modifier itself) */
export const isForwardedKey = (key: KeyForward): boolean => {
  const name = key.key.length === 1 ? key.key.toLowerCase() : key.key;
  if (!FORWARDED_KEYS.includes(name)) return false;
  return name === "Shift" || name === "Control" || (!key.ctrlKey && !key.metaKey && !key.altKey);
};

const isKey = (value: unknown): value is KeyForward =>
  isObject(value) && (value.type === "keydown" || value.type === "keyup") && isString(value.key) && value.key.length <= 20 && isString(value.code) && value.code.length <= 30
  && ["shiftKey", "ctrlKey", "altKey", "metaKey", "repeat"].every(flag => typeof value[flag] === "boolean")
  && isForwardedKey(value as unknown as KeyForward);

const CHECKS: { [N in FrameEventName]: (data: unknown) => boolean } = {
  ready: data => data === null,
  hover: data => data === null,
  state: data => isObject(data) && AR_STATUSES.includes(data.status as ArStatus) && (data.error === null || isString(data.error))
    && (data.spreadId === null || isId(data.spreadId)) && Array.isArray(data.found) && data.found.every(isId)
    && PICK_MODES.includes(data.pickMode as PickMode) && SHADING_MODES.includes(data.shading as ShadingMode) && typeof data.world === "boolean"
    && GIZMO_MODES.includes(data.gizmoMode as GizmoMode),
  vars: data => Array.isArray(data) && data.every(v => isObject(v) && isString(v.scope) && isString(v.name)),
  events: data => Array.isArray(data) && data.every(e => isObject(e) && isString(e.event) && isString(e.detail) && isFiniteNumber(e.at)),
  registry: data => isObject(data) && isObject(data.plugins) && Object.values(data.plugins).every(isObject) && isObject(data.failures)
    && Object.values(data.failures).every(isString),
  layout: data => isObject(data) && isObject(data.pageFormat) && isFiniteNumber(data.pageFormat.width) && isFiniteNumber(data.pageFormat.height)
    && isObject(data.places) && Object.values(data.places).every(p => isObject(p) && (p.printed === null || isPlacement(p.printed)) && (p.place === null || isPlacement(p.place))),
  timelines: data => isObject(data) && Object.values(data).every(t => isObject(t) && Array.isArray(t.clips)
    && t.clips.every(c => isObject(c) && isString(c.name) && isFiniteNumber(c.duration))
    && isObject(t.state) && isString(t.state.clip) && isFiniteNumber(t.state.time) && typeof t.state.playing === "boolean" && isFiniteNumber(t.state.duration)),
  pick: data => data === null || isPick(data),
  contextMenu: data => isObject(data) && (data.hit === null || isPick(data.hit)) && isFiniteNumber(data.x) && isFiniteNumber(data.y),
  placement: data => isObject(data) && isId(data.targetId) && isPath(data.path) && isObject(data.placement)
    && isVector(data.placement.position) && isVector(data.placement.rotation)
    && (isFiniteNumber(data.placement.scale) || isVector(data.placement.scale)),
  ghostChange: data => isPlacement(data),
  preview: data => isString(data) && data.length <= 20000,
  key: isKey,
  log: data => isObject(data) && LOG_LEVELS.includes(data.level as FrameLog["level"]) && isString(data.text) && data.text.length <= LOG_MAX,
};

/** A message from the frame as an event the page may act on, null for anything else (another message, a wrong shape) */
export const readFrameEvent = (message: unknown): FrameEvent | null => {
  if (!isObject(message) || message.osct !== MESSAGE_TAG || message.kind !== "event" || !isString(message.name)) return null;
  const check = (CHECKS as Record<string, (data: unknown) => boolean>)[message.name];
  if (!check || !Object.hasOwn(CHECKS, message.name)) return null;
  return check(message.data) ? ({ name: message.name, data: message.data } as FrameEvent) : null;
};

/** A message from the frame as the reply to a request, null for anything else */
export const readFrameReply = (message: unknown): FrameReply | null =>
  isObject(message) && message.osct === MESSAGE_TAG && message.kind === "reply" && Number.isInteger(message.id) && typeof message.ok === "boolean"
  && (message.error === undefined || isString(message.error))
    ? (message as unknown as FrameReply)
    : null;

/** A message from the page as a request the frame answers, null for anything else */
export const readFrameRequest = (message: unknown): FrameRequest | null =>
  isObject(message) && message.osct === MESSAGE_TAG && message.kind === "request" && Number.isInteger(message.id)
  && (FRAME_METHODS as readonly unknown[]).includes(message.method) && Array.isArray(message.args)
    ? (message as unknown as FrameRequest)
    : null;

export const eventMessage = <N extends FrameEventName>(name: N, data: FrameEvents[N]) => ({ osct: MESSAGE_TAG, kind: "event" as const, name, data });

// ── requests and their replies ──

/**
 * The page's side of the requests: each gets an id, its reply settles its promise. Requests wait until the frame is
 * ready (`open()`); `close()` rejects whatever is pending (the frame went).
 */
export class FrameRequests {
  private next = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private queue: FrameRequest[] = [];
  private isOpen = false;
  /** Why requests are refused for good (`end`), null while the frame may answer */
  private ended: string | null = null;

  constructor(private send: (request: FrameRequest) => void) {}

  request<T = unknown>(method: FrameMethod, args: unknown[] = []): Promise<T> {
    if (this.ended) return Promise.reject(new Error(this.ended));
    const request: FrameRequest = { osct: MESSAGE_TAG, kind: "request", id: this.next++, method, args };
    const settled = new Promise<T>((resolve, reject) => this.pending.set(request.id, { resolve: resolve as (value: unknown) => void, reject }));
    if (this.isOpen) this.send(request);
    else this.queue.push(request);
    return settled;
  }

  /** A request that goes before everything queued (the frame's `init`) */
  first<T = unknown>(method: FrameMethod, args: unknown[] = []): Promise<T> {
    const request: FrameRequest = { osct: MESSAGE_TAG, kind: "request", id: this.next++, method, args };
    const settled = new Promise<T>((resolve, reject) => this.pending.set(request.id, { resolve: resolve as (value: unknown) => void, reject }));
    this.send(request);
    return settled;
  }

  /** The frame answers: the queued requests go out */
  open(): void {
    this.isOpen = true;
    const queued = this.queue;
    this.queue = [];
    queued.forEach(request => this.send(request));
  }

  /** The frame is loading again: new requests wait for it */
  hold(): void {
    this.isOpen = false;
  }

  /** A reply settles its request (an unknown id is ignored) */
  settle(reply: FrameReply): void {
    const waiting = this.pending.get(reply.id);
    if (!waiting) return;
    this.pending.delete(reply.id);
    if (reply.ok) waiting.resolve(reply.value);
    else waiting.reject(new Error(reply.error ?? "the stage frame refused"));
  }

  /** The frame went: every pending request is rejected */
  close(reason = "the stage frame closed"): void {
    this.isOpen = false;
    this.queue = [];
    this.pending.forEach(waiting => waiting.reject(new Error(reason)));
    this.pending.clear();
  }

  /** The frame is gone for good (the stage was disposed): what is pending and every later request is rejected */
  end(reason = "the stage is gone"): void {
    this.close(reason);
    this.ended = reason;
  }

  get size(): number {
    return this.pending.size;
  }

  /** A request of this method waits for the frame (queued, not sent yet) */
  waiting(method: FrameMethod): boolean {
    return this.queue.some(request => request.method === method);
  }
}

// ── the frame document's Content Security Policy ──

/**
 * A source a URL may be loaded from under the frame's policy, path-restricted: `<origin><path>/`. An unparseable or
 * non-http(s) URL gives none.
 */
const sourceOf = (url: string, base: string): string | null => {
  try {
    const parsed = new URL(url, base);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const path = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
};

/** Where a content base's files live: `contentUrl` puts every content path (`/assets/content/…`) after the base */
const CONTENT_FILES = "/assets/content/";

/** An exact file a URL names under the frame's policy (`<origin><path>`), none for an unparseable or non-http(s) URL */
const fileOf = (url: string, base: string): string | null => {
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? `${parsed.origin}${parsed.pathname}` : null;
  } catch {
    return null;
  }
};

/**
 * The Content Security Policy of the frame's document: it may load its own scripts and the editor's static files
 * (`<origin><appBase>`), the Library's files (`<origin><apiBase>/content/`), the book's content under each content base
 * (`<base>/assets/content/` – the CDN or wherever the draft's files live; the declared plugins' modules are there too),
 * a few exact `files` (the trigger protocol at the site's root), plus `blob:` and `data:` (the Code tab's transpiled
 * module, textures and buffers inside a model). **No request reaches the rest of the API** – every source is
 * path-restricted, never `'self'` (which would be the whole origin, `/api` included); a source that would still reach
 * into the API other than its public `content/` route is left out. `devSocket` admits the dev server's hot reload.
 * Nothing may be framed, posted or embedded, and no worker started.
 */
export const frameCsp = ({ origin, appBase, apiBase, contentBases, files = [], devSocket }: {
  origin: string;
  appBase: string;
  apiBase: string;
  contentBases: readonly string[];
  files?: readonly string[];
  devSocket?: string | null;
}): string => {
  const app = sourceOf(appBase, origin)!;
  const library = sourceOf(`${apiBase.replace(/\/+$/, "")}/content/`, origin)!;
  const api = sourceOf(apiBase, origin)!;
  /** Not into the API, unless it is its public content route */
  const outsideApi = (source: string | null): source is string =>
    !!source && (!(source.startsWith(api) || api.startsWith(source)) || source.startsWith(library));
  const content = contentBases.map(base => sourceOf(`${base.replace(/\/+$/, "")}${CONTENT_FILES}`, origin)).filter(outsideApi);
  const exact = files.map(file => fileOf(file, origin)).filter(outsideApi);
  const scripts = [...new Set([app, ...content])].join(" ");
  const media = [...new Set([app, library, ...content])].join(" ");
  const connect = [...new Set([app, library, ...content, ...exact])].join(" ");
  const socket = devSocket ? ` ${devSocket}` : "";
  return [
    "default-src 'none'",
    `script-src ${scripts} blob: 'wasm-unsafe-eval'`,
    `style-src ${app} 'unsafe-inline'`,
    `connect-src ${connect} blob: data:${socket}`,
    `img-src ${media} blob: data:`,
    `media-src ${media} blob: data:`,
    `font-src ${app} data:`,
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "manifest-src 'none'",
  ].join("; ");
};
