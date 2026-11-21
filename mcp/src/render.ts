// render_scene (#89): a picture of a scene of the draft as the editor's stage shows it, so an agent sees its own
// placement. The editor has a render view (`/editor/<experience>/<scene>/?render=<view>` – the stage alone, the state
// on `<html data-osct-render>`, editor/src/lib/render-view.ts); this opens it in the computer's own Chrome or Edge,
// headless, in a throwaway profile, driven over the DevTools protocol with Node's own WebSocket – no browser download,
// no dependency, so the one-file bundle stays as it is. The page signs in with the server's token: the browser adds
// `Authorization: Bearer` to the page's GET requests to this instance's API only, and refuses every write there –
// the render view reads, it never saves. The token is never in a URL, a file or a result.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLocalUrl } from "./config.ts";

export const RENDER_VIEWS = ["reader", "top", "low", "far"] as const;
export type RenderView = (typeof RENDER_VIEWS)[number];

/** Where Chrome and Edge are installed by default, per platform – `OSCT_BROWSER` names another */
export const BROWSER_PATHS: Record<string, string[]> = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge", "/snap/bin/chromium"],
};

/** The browser to drive: `OSCT_BROWSER`, else the first installed Chrome or Edge; null when there is none */
export function findBrowser(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform, exists: (path: string) => boolean = existsSync): string | null {
  const named = env.OSCT_BROWSER?.trim();
  if (named) return exists(named) ? named : null;
  const local = env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")] : [];
  return [...(BROWSER_PATHS[platform] ?? []), ...(platform === "win32" ? local : [])].find(exists) ?? null;
}

/** The editor's render view of a scene (no token in it – the browser adds that to the API requests) */
export const renderUrl = (editor: string, experience: string, scene: string, view: RenderView): string =>
  `${editor}/${encodeURIComponent(experience)}/${encodeURIComponent(scene)}/?render=${view}`;

/**
 * The URL prefix the page's API requests start with, the only place the token goes: the API itself when the editor is
 * served next to it (one origin – a deployed instance), or the local dev editor's `/api` (its dev server passes it to
 * the local API). An editor on another host than its API is refused: the token would leave the instance.
 */
export function tokenScope(api: string, editor: string): string {
  const a = new URL(api);
  const e = new URL(editor);
  if (a.origin === e.origin) return `${a.origin}${a.pathname.replace(/\/+$/, "")}/`;
  if (isLocalUrl(api) && isLocalUrl(editor)) return `${e.origin}/api/`;
  throw new Error(`The editor (${e.origin}) and the API (${a.origin}) are on different hosts – render_scene sends the token to the API's own origin only. Set OSCT_EDITOR_URL to the editor next to the API.`);
}

/** What the browser does with a request of the page: the token on a read of the API, a write there refused, anything else as it is */
export function requestAction(method: string, url: string, scope: string): "token" | "block" | "pass" {
  if (!url.startsWith(scope)) return "pass";
  return method === "GET" || method === "HEAD" ? "token" : "block";
}

/** The requests in flight across the page and its frames, and since when none is – the stage's files have loaded */
export class InFlight {
  private open = new Set<string>();
  private quietSince: number;

  constructor(now: number) {
    this.quietSince = now;
  }

  start(id: string): void {
    this.open.add(id);
  }

  end(id: string, now: number): void {
    if (this.open.delete(id) && this.open.size === 0) this.quietSince = now;
  }

  get count(): number {
    return this.open.size;
  }

  /** No request for `ms` up to `now` */
  quiet(now: number, ms: number): boolean {
    return this.open.size === 0 && now - this.quietSince >= ms;
  }
}

/**
 * A request the picture waits for: not a stream that never ends by itself – a video or a sound (`Media`, ranges for as
 * long as it plays), a WebSocket, an event stream – and not a document (the page's is behind the ready state; the stage
 * frame's finishes in the frame's own process, before its session is attached)
 */
export const countsForLoad = (type: string | undefined): boolean => !["Document", "Media", "WebSocket", "EventSource"].includes(type ?? "");

/** The picture's file name: experience, scene, view and the time, safe on every file system */
export const pngName = (experience: string, scene: string, view: RenderView, at: Date): string =>
  `${[experience, scene, view].map(part => part.replace(/[^A-Za-z0-9_-]+/g, "_")).join("-")}-${at.toISOString().replace(/[:.]/g, "-")}.png`;

// ── the DevTools protocol over Node's WebSocket ──

type Params = Record<string, unknown>;
type Listener = (method: string, params: Params, sessionId: string | undefined) => void;

class Cdp {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: Params) => void; reject: (error: Error) => void }>();
  private listeners = new Set<Listener>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Params; error?: { message: string }; method?: string; params?: Params; sessionId?: string };
      if (message.id !== undefined) {
        const waiting = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) waiting?.reject(new Error(message.error.message));
        else waiting?.resolve(message.result ?? {});
      } else if (message.method) {
        for (const listener of this.listeners) listener(message.method, message.params ?? {}, message.sessionId);
      }
    });
    ws.addEventListener("close", () => {
      for (const waiting of this.pending.values()) waiting.reject(new Error("the browser closed"));
      this.pending.clear();
    });
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new Cdp(ws)), { once: true });
      ws.addEventListener("error", () => reject(new Error("could not connect to the browser")), { once: true });
    });
  }

  send<T = Params>(method: string, params: Params = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener: Listener): void {
    this.listeners.add(listener);
  }

  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Starts the browser headless in its own profile; resolves with the DevTools address it prints */
function launch(browser: string, profile: string, width: number, height: number): Promise<{ child: ChildProcess; ws: string }> {
  const args = [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-sync", "--mute-audio", "--hide-scrollbars", `--window-size=${width},${height}`, "about:blank",
  ];
  const child = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`${browser} did not start within 20 s`)), 20_000);
    child.stderr!.on("data", chunk => {
      output += String(chunk);
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(output);
      if (found) {
        clearTimeout(timer);
        resolve({ child, ws: found[1]! });
      }
    });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", code => {
      clearTimeout(timer);
      reject(new Error(`${browser} ended (${code}) before it was ready`));
    });
  });
}

export interface RenderOptions {
  api: string;
  editor: string;
  /** `Bearer …` for the page's API reads */
  authorization: string;
  experience: string;
  scene: string;
  view: RenderView;
  width: number;
  height: number;
  /** how long the stage may take to run (ms) */
  timeoutMs?: number;
  /** how long the network must be quiet after that (ms) */
  quietMs?: number;
  browser?: string | null;
  outDir?: string;
}

export interface Rendered {
  file: string;
  png: Buffer;
  /** the stage's files had all loaded (else the picture was taken when the wait ran out) */
  settled: boolean;
  /** API writes the page tried and the browser refused (the render view should try none) */
  blockedWrites: number;
}

/** Opens the render view headless, waits until the stage runs and its files have loaded, and takes the picture */
export async function renderScene(options: RenderOptions): Promise<Rendered> {
  const browser = options.browser === undefined ? findBrowser() : options.browser;
  if (!browser) throw new Error("No Chrome or Edge found on this computer – install one, or set OSCT_BROWSER to a Chromium browser's executable.");
  const scope = tokenScope(options.api, options.editor);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const quietMs = options.quietMs ?? 1_000;
  const profile = await mkdtemp(join(tmpdir(), "osct-render-"));
  let child: ChildProcess | null = null;
  let cdp: Cdp | null = null;
  try {
    const started = await launch(browser, profile, options.width, options.height);
    child = started.child;
    cdp = await Cdp.connect(started.ws);
    const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId: page } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });

    const inFlight = new InFlight(Date.now());
    let blockedWrites = 0;
    const client = cdp;
    client.on((method, params, sessionId) => {
      // by the request's id alone: a frame's document is asked for by the page's session and finishes in the frame's
      const key = (id: unknown) => String(id);
      if (method === "Network.requestWillBeSent") {
        if (countsForLoad(params.type as string | undefined)) inFlight.start(key(params.requestId));
      } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        inFlight.end(key(params.requestId), Date.now());
      } else if (method === "Target.attachedToTarget") {
        // a frame in a process of its own (the sandboxed stage frame): its requests count too
        const child = params.sessionId as string;
        void client.send("Network.enable", {}, child).catch(() => {})
          .then(() => client.send("Runtime.runIfWaitingForDebugger", {}, child)).catch(() => {});
      } else if (method === "Fetch.requestPaused" && sessionId === page) {
        const request = params.request as { url: string; method: string; headers: Record<string, string> };
        const action = requestAction(request.method, request.url, scope);
        if (action === "block") {
          blockedWrites++;
          void client.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }, page).catch(() => {});
          return;
        }
        const headers = Object.entries(request.headers)
          .filter(([name]) => name.toLowerCase() !== "authorization" && name.toLowerCase() !== "cookie")
          .map(([name, value]) => ({ name, value }));
        if (action === "token") headers.push({ name: "Authorization", value: options.authorization });
        void client.send("Fetch.continueRequest", { requestId: params.requestId, headers }, page).catch(() => {});
      }
    });

    await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, page);
    await cdp.send("Network.enable", {}, page);
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${scope}*`, requestStage: "Request" }] }, page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: options.width, height: options.height, deviceScaleFactor: 1, mobile: false }, page);
    await cdp.send("Page.enable", {}, page);
    const navigated = await cdp.send<{ errorText?: string }>("Page.navigate", { url: renderUrl(options.editor, options.experience, options.scene, options.view) }, page);
    if (navigated.errorText) throw new Error(`The editor did not open (${navigated.errorText}) – is ${options.editor} right (OSCT_EDITOR_URL)?`);

    // the render view's state: loading → ready (the stage runs) or error (with its words)
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { result } = await cdp.send<{ result: { value?: [string, string] } }>("Runtime.evaluate", {
        expression: "(() => { const d = document.documentElement.dataset; return [d.osctRender ?? '', d.osctRenderError ?? '']; })()",
        returnByValue: true,
      }, page);
      const [state, error] = result.value ?? ["", ""];
      if (state === "error") throw new Error(`The editor could not show the scene: ${error || "unknown error"}`);
      if (state === "ready") break;
      if (Date.now() > deadline) {
        throw new Error(state === "" ? `The editor at ${options.editor} has no render view (an older version?) or did not load within ${timeoutMs / 1000} s.` : `The stage did not start within ${timeoutMs / 1000} s.`);
      }
      await sleep(250);
    }
    // …then its files: the network quiet for a while (a model, the reference images, the sky), at most 20 s more
    const settleBy = Date.now() + 20_000;
    while (!inFlight.quiet(Date.now(), quietMs) && Date.now() < settleBy) await sleep(100);
    const settled = inFlight.quiet(Date.now(), quietMs);
    await sleep(300); // a few frames on what arrived last

    const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" }, page);
    const png = Buffer.from(data, "base64");
    const dir = options.outDir ?? join(tmpdir(), "osct-renders");
    await mkdir(dir, { recursive: true });
    const file = join(dir, pngName(options.experience, options.scene, options.view, new Date()));
    await writeFile(file, png);
    return { file, png, settled, blockedWrites };
  } finally {
    if (cdp) {
      await cdp.send("Browser.close").catch(() => {});
      cdp.close();
    }
    if (child && child.exitCode === null) {
      await Promise.race([new Promise(resolve => child!.once("exit", resolve)), sleep(3_000)]);
      if (child.exitCode === null) child.kill();
    }
    // the profile's files may stay locked a moment on Windows
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
  }
}
