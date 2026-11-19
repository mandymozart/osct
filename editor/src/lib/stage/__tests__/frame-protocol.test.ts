import { describe, expect, it } from "vitest";
import {
  contentBasesNamed, libraryFoldersNamed, libraryFoldersOf, eventMessage, FORWARDED_KEYS, FRAME_SANDBOX, frameCsp, FrameRequests, isForwardedKey, type KeyForward, MESSAGE_TAG, readFrameEvent, readFrameReply,
  readFrameRequest, surfaceMarks, surfaceReferenceMap,
} from "../frame-protocol";
import { MAX_HIDDEN_NODES, previewSync } from "../preview";

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
    expect(readFrameEvent(event("save", { experienceId: "demo" }))).toBeNull();
    expect(readFrameEvent(event("toString", null))).toBeNull();
    expect(readFrameEvent(event("__proto__", null))).toBeNull();
    expect(readFrameEvent(event("pick", { targetId: "key", path: "0" }))).toBeNull();
    expect(readFrameEvent(event("pick", { targetId: "", path: [] }))).toBeNull();
    expect(readFrameEvent(event("placement", { targetId: "door", path: [], placement: { position: [0, 0], rotation: [0, 0, 0], scale: 1 } }))).toBeNull();
    expect(readFrameEvent(event("placement", { targetId: "door", path: [-1], placement: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } }))).toBeNull();
    expect(readFrameEvent(event("state", { status: "flying" }))).toBeNull();
    expect(readFrameEvent(event("log", { level: "info", text: "x".repeat(5000) }))).toBeNull();
    expect(readFrameEvent(event("ghostChange", { surface: "", x: 0, y: 0, width: 10 }))).toBeNull();
    expect(readFrameEvent(event("preview", { shading: "rendered" }))).toBeNull();
  });

  it("carries the preview with the most nodes hidden on the stage the longest keys allow (#311) in one event", () => {
    const deepest = Array(16).fill(9999).join(".");
    const hiddenNodes = Array.from({ length: MAX_HIDDEN_NODES }, (_, i) => `${String(i).padStart(200, "t")}:${deepest}`);
    const sync = previewSync({ hiddenNodes, hidden: [] });
    expect(JSON.parse(sync).hiddenNodes).toHaveLength(MAX_HIDDEN_NODES);
    expect(readFrameEvent(event("preview", sync))?.name).toBe("preview");
  });

  it("forwards only the page's own shortcuts – never a key that could save or publish", () => {
    expect(readFrameEvent(event("key", key({})))).not.toBeNull();
    expect(readFrameEvent(event("key", key({ key: "Delete", code: "Delete" })))).not.toBeNull();
    expect(readFrameEvent(event("key", key({ key: "Shift", code: "ShiftLeft", shiftKey: true })))).not.toBeNull();
    expect(readFrameEvent(event("key", key({ key: "s", code: "KeyS", ctrlKey: true })))).toBeNull();
    expect(readFrameEvent(event("key", key({ key: "e", ctrlKey: true })))).toBeNull();
    expect(readFrameEvent(event("key", key({ key: "Enter", code: "Enter", ctrlKey: true })))).toBeNull();
    expect(readFrameEvent(event("key", key({ key: "p", code: "KeyP" })))).toBeNull();
    // S is the Surface tool (#314): forwarded alone, never with Ctrl or Meta (the Code tab's save)
    expect(FORWARDED_KEYS).toContain("s");
    expect(isForwardedKey(key({ key: "s", code: "KeyS" }))).toBe(true);
    expect(readFrameEvent(event("key", key({ key: "s", code: "KeyS", metaKey: true })))).toBeNull();
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
    requests.settle({ osct: MESSAGE_TAG, kind: "reply", id: sent[1].id, ok: false, error: "no such scene" });
    await expect(init).resolves.toBeNull();
    await expect(open).rejects.toThrow("no such scene");
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
    const policy = csp([ORIGIN, `${ORIGIN}/api/editor/experiences/demo/draft/abc`, `${ORIGIN}/api/content/local/x`]);
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

  it("admits other content builds the draft names for images and media only (#252)", () => {
    const old = "https://cdn.example/staging/53099b9d32d8";
    const policy = csp(["https://cdn.example/staging/b2a34c9b8be6"], { mediaBases: [old] });
    expect(directive(policy, "img-src")).toContain(`${old}/assets/content/`);
    expect(directive(policy, "media-src")).toContain(`${old}/assets/content/`);
    expect(directive(policy, "script-src")).not.toContain(`${old}/assets/content/`);
    expect(directive(policy, "connect-src")).not.toContain(`${old}/assets/content/`);
    // Never into the API, as every other source
    expect(directive(csp([], { mediaBases: [`${ORIGIN}/api/editor`] }), "img-src")).not.toContain(`${ORIGIN}/api/editor/assets/content/`);
  });

  it("finds the content builds a draft names besides its own (#252)", () => {
    const own = "https://cdn.example/staging/b2a34c9b8be6";
    const config = JSON.stringify({ entries: [
      { image: `${own}/assets/content/entries/a/image.jpg`, target: { imageSrc: "/assets/content/entries/a/target.jpg" } },
      { target: { entity: { assets: [{ src: "https://cdn.example/staging/2e0a4af94ca2/assets/content/entries/p106-1/video.mp4" }] } } },
      { media: "https://www.youtube.com/watch?v=x" },
    ] });
    expect(contentBasesNamed([config], `${own}/`)).toEqual(["https://cdn.example/staging/2e0a4af94ca2"]);
    expect(contentBasesNamed([config], null)).toEqual(["https://cdn.example/staging/2e0a4af94ca2", own]);
  });

  it("admits the Library's folders the draft names for files and requests, never scripts (#254)", () => {
    const folder = "https://cdn.example/assets/demo/";
    const policy = csp(["https://cdn.example/demo/abc"], { libraryFolders: [folder] });
    for (const name of ["img-src", "media-src", "connect-src"]) expect(directive(policy, name)).toContain(folder);
    expect(directive(policy, "script-src")).not.toContain(folder);
    // Never into the API, as every other source
    expect(directive(csp([], { libraryFolders: [`${ORIGIN}/api/assets/demo/`] }), "connect-src")).not.toContain(`${ORIGIN}/api/assets/demo/`);
  });

  it("finds the Library's folders in a draft, and nothing else (#254)", () => {
    const id = "2d327604-9439-4930-9815-55f0016177db";
    const config = JSON.stringify({ entries: [
      { target: { imageSrc: `https://cdn.example/assets/demo/${id}/v1.jpg`, entity: { assets: [{ src: `https://cdn.example/assets/demo/${id}/v12.glb` }] } } },
      { target: { imageSrc: `https://other.example/x/assets/My_Book/${id}/v2.png` } },
      { image: "https://cdn.example/staging/b2a34c9b8be6/assets/content/entries/a/image.jpg" },
      { media: `https://cdn.example/assets/demo/${id}/notes.jpg` },
    ] });
    expect(libraryFoldersNamed([config])).toEqual(["https://cdn.example/assets/demo/", "https://other.example/x/assets/My_Book/"]);
  });

  it("admits the experience's own Library folder before the draft names a file of it (#258)", () => {
    const id = "72df7022-276d-4aaf-bb70-52a6631a7ad7";
    const draft = { baseUrl: "/api/editor/experiences/osct/draft", assetsBase: "https://cdn.example/staging/abc" };
    // A draft that names no upload yet: the file just uploaded and picked for a node still loads
    const fresh = { ...draft, libraryBase: "https://cdn.example/assets/osct", responses: { "/latest.json": "{}", "/missing.json": null } };
    expect(libraryFoldersOf(fresh)).toEqual(["https://cdn.example/assets/osct/"]);
    const policy = csp([draft.assetsBase], { libraryFolders: libraryFoldersOf(fresh) });
    expect(directive(policy, "connect-src")).toContain("https://cdn.example/assets/osct/");
    expect(directive(policy, "script-src")).not.toContain("https://cdn.example/assets/osct/");
    // Once saved the draft names the same folder: the policy's sources stay as they were (no new frame)
    const saved = { ...fresh, libraryBase: "https://cdn.example/assets/osct/", responses: { "/game.config.json": JSON.stringify({ src: `https://cdn.example/assets/osct/${id}/v1.glb` }) } };
    expect(libraryFoldersOf(saved)).toEqual(libraryFoldersOf(fresh));
    // Another experience's upload a row names comes on top; an instance that names no folder admits only those
    const other = { ...saved, responses: { "/game.config.json": JSON.stringify({ src: `https://cdn.example/assets/demo/${id}/v2.glb` }) } };
    expect(libraryFoldersOf(other)).toEqual(["https://cdn.example/assets/demo/", "https://cdn.example/assets/osct/"]);
    expect(libraryFoldersOf({ ...other, libraryBase: null })).toEqual(["https://cdn.example/assets/demo/"]);
    expect(libraryFoldersOf({ ...draft, responses: {} })).toEqual([]);
  });

  it("admits the dev server's socket only when asked", () => {
    expect(csp([])).not.toContain("ws:");
    expect(directive(csp([], { devSocket: "ws://127.0.0.1:5182/editor/" }), "connect-src")).toContain("ws://127.0.0.1:5182/editor/");
  });

  it("leaves out what it cannot read", () => {
    expect(directive(csp(["javascript:alert(1)", "not a url ::"]), "connect-src")).not.toContain("javascript:");
  });
});

describe("the scene's surfaces across the frame (#314)", () => {
  it("reads a placement on a surface by id, the layout's surfaces and the surface a tap hit", () => {
    expect(readFrameEvent(event("ghostChange", { surface: "p41", x: 1, y: 2, width: 30 }))?.data).toMatchObject({ surface: "p41" });
    expect(readFrameEvent(event("ghostChange", { x: 1, y: 2, width: 30 }))?.data).toEqual({ x: 1, y: 2, width: 30 });
    expect(readFrameEvent(event("ghostChange", { surface: 4, x: 1, y: 2, width: 30 }))).toBeNull();
    const surfaces = [{ id: "w", widthMm: 400, heightMm: 300, flat: false }];
    const place = { surface: "w", x: 1, y: 2, width: 30 };
    expect(readFrameEvent(event("layout", { places: { t: { place } }, surfaces }))?.name).toBe("layout");
    expect(readFrameEvent(event("layout", { places: { t: { place: null } }, surfaces: [] }))?.name).toBe("layout");
    expect(readFrameEvent(event("layout", { places: {} }))).toBeNull();
    expect(readFrameEvent(event("layout", { places: {}, surfaces: [{ id: "w" }] }))).toBeNull();
    expect(readFrameEvent(event("surfacePick", { surfaceId: "w", x: 10, y: 20 }))?.data).toEqual({ surfaceId: "w", x: 10, y: 20 });
    expect(readFrameEvent(event("surfacePick", null))?.name).toBe("surfacePick");
    expect(readFrameEvent(event("surfacePick", { surfaceId: "w", x: "10", y: 20 }))).toBeNull();
  });

  it("takes reference images by scene and surface: http(s) URLs only, a known fit (else cover)", () => {
    expect(surfaceReferenceMap({
      s1: { left: { url: "https://cdn.test/a.jpg", fit: "contain" }, right: { url: "https://cdn.test/b.jpg", fit: "zoom" }, bad: { url: "javascript:alert(1)" } },
      s2: { x: { url: "data:image/png;base64,AA" } },
      "": { y: { url: "https://cdn.test/c.jpg" } },
      s3: "nope",
    })).toEqual({ s1: { left: { url: "https://cdn.test/a.jpg", fit: "contain" }, right: { url: "https://cdn.test/b.jpg", fit: "cover" } } });
    expect(surfaceReferenceMap(null)).toEqual({});
  });

  it("takes the surfaces to mark as ids only", () => {
    expect(surfaceMarks(["a", "", 3, "b"], "a")).toEqual({ outlined: ["a", "b"], highlighted: "a" });
    expect(surfaceMarks("a", 5)).toEqual({ outlined: [], highlighted: null });
    expect(readFrameRequest({ osct: MESSAGE_TAG, kind: "request", id: 1, method: "surfaceMarks", args: [[], null] })?.method).toBe("surfaceMarks");
    expect(readFrameRequest({ osct: MESSAGE_TAG, kind: "request", id: 2, method: "surfaceReferences", args: [{}] })?.method).toBe("surfaceReferences");
  });
});
