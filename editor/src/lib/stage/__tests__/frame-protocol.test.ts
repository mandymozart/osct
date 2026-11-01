import { describe, expect, it } from "vitest";
import {
  eventMessage, FORWARDED_KEYS, FRAME_SANDBOX, frameCsp, FrameRequests, isForwardedKey, type KeyForward, MESSAGE_TAG, readFrameEvent, readFrameReply,
  readFrameRequest,
} from "../frame-protocol";

/**
 * The stage frame's protocol (#234): what the page acts on from the frame, how requests are answered, and the frame
 * document's policy – no request of plugin code reaches the API.
 */

const event = (name: string, data: unknown) => ({ osct: MESSAGE_TAG, kind: "event", name, data });
const key = (patch: Partial<KeyForward>): KeyForward => ({ type: "keydown", key: "e", code: "KeyE", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...patch });

describe("the sandbox", () => {
  it("lets the frame run scripts and nothing else – no allow-same-origin, so its origin stays opaque", () => {
    expect(FRAME_SANDBOX.split(/\s+/)).toEqual(["allow-scripts"]);
  });
});

describe("readFrameEvent: the page acts only on well-formed events", () => {
  it("reads the frame's events", () => {
    expect(readFrameEvent(eventMessage("ready", null))).toEqual({ name: "ready", data: null });
    expect(readFrameEvent(event("pick", { targetId: "key", path: [0, 1] }))).toEqual({ name: "pick", data: { targetId: "key", path: [0, 1] } });
    expect(readFrameEvent(event("pick", null))).toEqual({ name: "pick", data: null });
    const placement = { targetId: "door", path: [], placement: { position: [0.1, 0, 0], rotation: [0, 90, 0], scale: 1 } };
    expect(readFrameEvent(event("placement", placement))?.data).toEqual(placement);
    expect(readFrameEvent(event("log", { level: "info", text: "[plugin fx] hello" }))?.name).toBe("log");
    expect(readFrameEvent(event("hover", null))?.name).toBe("hover");
  });

  it("ignores other messages, unknown events and every wrong shape", () => {
    expect(readFrameEvent("hello")).toBeNull();
    expect(readFrameEvent({ kind: "event", name: "ready", data: null })).toBeNull();
    expect(readFrameEvent(event("save", { bookId: "demo" }))).toBeNull();
    expect(readFrameEvent(event("toString", null))).toBeNull();
    expect(readFrameEvent(event("__proto__", null))).toBeNull();
    expect(readFrameEvent(event("pick", { targetId: "key", path: "0" }))).toBeNull();
    expect(readFrameEvent(event("pick", { targetId: "", path: [] }))).toBeNull();
    expect(readFrameEvent(event("placement", { targetId: "door", path: [], placement: { position: [0, 0], rotation: [0, 0, 0], scale: 1 } }))).toBeNull();
    expect(readFrameEvent(event("placement", { targetId: "door", path: [-1], placement: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } }))).toBeNull();
    expect(readFrameEvent(event("state", { status: "flying" }))).toBeNull();
    expect(readFrameEvent(event("log", { level: "info", text: "x".repeat(5000) }))).toBeNull();
    expect(readFrameEvent(event("ghostChange", { surface: "ceiling", x: 0, y: 0, width: 10 }))).toBeNull();
    expect(readFrameEvent(event("preview", { shading: "rendered" }))).toBeNull();
  });

  it("forwards only the page's own shortcuts – never a key that could save or publish", () => {
    expect(readFrameEvent(event("key", key({})))).not.toBeNull();
    expect(readFrameEvent(event("key", key({ key: "Delete", code: "Delete" })))).not.toBeNull();
    expect(readFrameEvent(event("key", key({ key: "Shift", code: "ShiftLeft", shiftKey: true })))).not.toBeNull();
    expect(readFrameEvent(event("key", key({ key: "s", code: "KeyS", ctrlKey: true })))).toBeNull();
    expect(readFrameEvent(event("key", key({ key: "e", ctrlKey: true })))).toBeNull();
    expect(readFrameEvent(event("key", key({ key: "Enter", code: "Enter", ctrlKey: true })))).toBeNull();
    expect(readFrameEvent(event("key", key({ key: "p", code: "KeyP" })))).toBeNull();
    expect(FORWARDED_KEYS).not.toContain("s");
    expect(isForwardedKey(key({ key: "E" }))).toBe(true);
  });
});

describe("requests and replies", () => {
  it("queue until the frame is ready, then go out in order; a reply settles its request", async () => {
    const sent: Array<{ id: number; method: string }> = [];
    const requests = new FrameRequests(request => sent.push(request));
    const open = requests.request<string>("open", ["the-key"]);
    expect(sent).toEqual([]);
    expect(requests.waiting("open")).toBe(true);
    const init = requests.first("init", [{}]);
    expect(sent.map(r => r.method)).toEqual(["init"]);
    requests.open();
    expect(sent.map(r => r.method)).toEqual(["init", "open"]);
    expect(requests.waiting("open")).toBe(false);
    requests.settle({ osct: MESSAGE_TAG, kind: "reply", id: sent[0].id, ok: true, value: null });
    requests.settle({ osct: MESSAGE_TAG, kind: "reply", id: sent[1].id, ok: false, error: "no such spread" });
    await expect(init).resolves.toBeNull();
    await expect(open).rejects.toThrow("no such spread");
    expect(requests.size).toBe(0);
  });

  it("rejects what is pending when the frame goes", async () => {
    const requests = new FrameRequests(() => undefined);
    requests.open();
    const tap = requests.request("tap", ["key"]);
    requests.close();
    await expect(tap).rejects.toThrow(/closed/);
    // Gone for good: every later request is refused at once, nothing waits forever
    requests.end();
    await expect(requests.request("tap", ["key"])).rejects.toThrow(/gone/);
    expect(requests.size).toBe(0);
  });

  it("reads replies and requests only in their own shape", () => {
    expect(readFrameReply({ osct: MESSAGE_TAG, kind: "reply", id: 3, ok: true, value: 1 })).not.toBeNull();
    expect(readFrameReply({ osct: MESSAGE_TAG, kind: "reply", id: "3", ok: true })).toBeNull();
    expect(readFrameRequest({ osct: MESSAGE_TAG, kind: "request", id: 1, method: "open", args: ["x"] })?.method).toBe("open");
    expect(readFrameRequest({ osct: MESSAGE_TAG, kind: "request", id: 1, method: "fetch", args: [] })).toBeNull();
    expect(readFrameRequest({ osct: MESSAGE_TAG, kind: "request", id: 1, method: "open", args: "x" })).toBeNull();
  });
});

describe("frameCsp: plugin code reaches the content, never the API", () => {
  const ORIGIN = "https://osct.example";
  const csp = (contentBases: string[], extra: Partial<Parameters<typeof frameCsp>[0]> = {}) =>
    frameCsp({ origin: ORIGIN, appBase: "/editor/", apiBase: "/api", contentBases, files: ["/trigger-protocol.json"], ...extra });
  const directive = (policy: string, name: string) => policy.split("; ").find(d => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

  it("names every source with its path – never 'self' or a whole origin", () => {
    const policy = csp(["https://cdn.example/demo"]);
    expect(policy).not.toContain("'self'");
    expect(directive(policy, "default-src")).toEqual(["'none'"]);
    expect(directive(policy, "connect-src")).toEqual([
      "https://osct.example/editor/", "https://osct.example/api/content/", "https://cdn.example/demo/assets/content/", "https://osct.example/trigger-protocol.json", "blob:", "data:",
    ]);
    expect(directive(policy, "script-src")).toEqual(["https://osct.example/editor/", "https://cdn.example/demo/assets/content/", "blob:", "'wasm-unsafe-eval'"]);
    for (const name of ["worker-src", "frame-src", "object-src", "base-uri", "form-action"]) expect(directive(policy, name)).toEqual(["'none'"]);
  });

  it("reaches into the API only through its public content route", () => {
    const sources = (policy: string) => ["connect-src", "script-src", "img-src", "media-src"].flatMap(name => directive(policy, name));
    // Content served with the app at the site's root, a draft under the API, the API's own content route
    const policy = csp([ORIGIN, `${ORIGIN}/api/editor/books/demo/draft/abc`, `${ORIGIN}/api/content/local/x`]);
    for (const source of sources(policy)) {
      const reachesApi = source.startsWith(`${ORIGIN}/api/`) && !source.startsWith(`${ORIGIN}/api/content/`);
      expect(reachesApi, source).toBe(false);
      expect(source === ORIGIN || source === `${ORIGIN}/`, source).toBe(false);
    }
    expect(directive(policy, "connect-src")).toContain("https://osct.example/assets/content/");
    // An API on another host: its content route only
    const remote = frameCsp({ origin: ORIGIN, appBase: "/editor/", apiBase: "https://api.example/api", contentBases: ["https://api.example"] });
    expect(directive(remote, "connect-src")).toEqual(["https://osct.example/editor/", "https://api.example/api/content/", "https://api.example/assets/content/", "blob:", "data:"]);
  });

  it("admits the dev server's socket only when asked", () => {
    expect(csp([])).not.toContain("ws:");
    expect(directive(csp([], { devSocket: "ws://127.0.0.1:5182/editor/" }), "connect-src")).toContain("ws://127.0.0.1:5182/editor/");
  });

  it("leaves out what it cannot read", () => {
    expect(directive(csp(["javascript:alert(1)", "not a url ::"]), "connect-src")).not.toContain("javascript:");
  });
});
