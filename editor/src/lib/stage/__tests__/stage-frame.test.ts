import { afterEach, describe, expect, it, vi } from "vitest";
import { componentSpec, type EntityData } from "@engine/types";
import { mirrorPluginRegistry } from "@engine/scene/plugins";
import { content } from "../../content.svelte";
import { plugins } from "../../plugins.svelte";
import { MESSAGE_TAG, REMOVED_WIRE } from "../frame-protocol";
import { Stage } from "../stage.svelte";

/**
 * The page's side of the stage frame (#234): the stage runs in an iframe sandboxed without `allow-same-origin`; the
 * page sends it the draft and every edit and acts on what it reports – only on well-formed events from that frame.
 */

const SNAPSHOT = { baseUrl: "/api/editor/books/demo/draft", assetsBase: "https://cdn.example/demo", responses: { "/api/editor/books/demo/draft/latest.json": "{}" } };
const DOOR: EntityData = { type: "group", assets: [], children: [{ type: "model", name: "door", assets: [], params: { position: [0, 0, 0] } }] };

type Sent = { osct: string; kind: string; id: number; method: string; args: unknown[] };
let stages: Stage[] = [];

const make = () => {
  content.snapshot = SNAPSHOT;
  const container = document.createElement("div");
  document.body.append(container);
  const stage = new Stage(container);
  stages.push(stage);
  const frame = container.querySelector("iframe")!;
  const sent: Sent[] = [];
  // The test environment loads no frame: a stand-in window takes the requests and is the events' source
  const frameWindow = { postMessage: (message: unknown) => { sent.push(message as Sent); } };
  Object.defineProperty(frame, "contentWindow", { configurable: true, get: () => frameWindow });
  const post = (data: unknown, source: unknown = frame.contentWindow) =>
    window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }));
  const emit = (name: string, data: unknown) => post({ osct: MESSAGE_TAG, kind: "event", name, data });
  const reply = (request: Sent, value: unknown = null) => post({ osct: MESSAGE_TAG, kind: "reply", id: request.id, ok: true, value });
  /** The frame says it is ready and answers init */
  const ready = async () => {
    emit("ready", null);
    await vi.waitFor(() => expect(sent.some(r => r.method === "init")).toBe(true));
    reply(sent.find(r => r.method === "init")!);
    await Promise.resolve();
  };
  return { stage, frame, sent, post, emit, reply, ready };
};

afterEach(async () => {
  await Promise.all(stages.map(stage => stage.dispose()));
  stages = [];
  mirrorPluginRegistry({ plugins: {}, failures: {} });
  plugins.logs = [];
  content.snapshot = null;
  vi.restoreAllMocks();
});

describe("the stage frame from the page's side", () => {
  it("is an iframe sandboxed with scripts only – no allow-same-origin – at the frame's route", () => {
    const { frame } = make();
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("src")).toMatch(/stage-frame\/?$/);
  });

  it("initialises the frame with the draft as text, then sends what waited for it", async () => {
    const { stage, sent, ready } = make();
    const opened = stage.open("the-key");
    await Promise.resolve();
    expect(sent).toEqual([]);
    await ready();
    const init = sent.find(r => r.method === "init")!;
    expect((init.args[0] as { content: unknown }).content).toEqual(SNAPSHOT);
    await vi.waitFor(() => expect(sent.map(r => r.method)).toContain("open"));
    expect(sent.find(r => r.method === "open")!.args).toEqual(["the-key"]);
    void opened.catch(() => undefined);
  });

  it("writes a gizmo's placement into the page's own override and sends it back", async () => {
    const { stage, sent, emit, ready } = make();
    await ready();
    void stage.override("door", DOOR);
    emit("placement", { targetId: "door", path: [0], placement: { position: [0.2, 0, 0], rotation: [0, 45, 0], scale: 2 } });
    const node = stage.overrideOf("door")!.children![0];
    expect(node.params).toMatchObject({ position: [0.2, 0, 0], rotation: [0, 45, 0], scale: 2 });
    await vi.waitFor(() => expect(sent.filter(r => r.method === "override")).toHaveLength(2));
    expect(sent.filter(r => r.method === "override")[1].args[1]).toEqual(stage.overrideOf("door"));
  });

  it("sends a removed entity as the wire's marker", async () => {
    const { stage, sent, ready } = make();
    await ready();
    void stage.override("door", DOOR);
    stage.removeNode("door", []);
    expect(stage.treeOf("door")).toBeUndefined();
    await vi.waitFor(() => expect(sent.filter(r => r.method === "override").at(-1)!.args).toEqual(["door", REMOVED_WIRE]));
  });

  it("acts on nothing that is malformed or comes from elsewhere", async () => {
    const { stage, post, emit, ready } = make();
    await ready();
    void stage.override("door", DOOR);
    const before = JSON.stringify(stage.overrideOf("door"));
    emit("placement", { targetId: "door", path: [0], placement: { position: "far away" } });
    post({ osct: MESSAGE_TAG, kind: "event", name: "placement", data: { targetId: "door", path: [0], placement: { position: [9, 9, 9], rotation: [0, 0, 0], scale: 1 } } }, window);
    emit("save", { bookId: "demo" });
    expect(JSON.stringify(stage.overrideOf("door"))).toBe(before);
  });

  it("mirrors the frame's plugin registry, so the panels read its specs", async () => {
    const { emit, ready } = make();
    await ready();
    const version = plugins.version;
    const spec = { description: "Spins.", params: { speed: { kind: "number", default: 1, min: 0, max: 5, description: "Speed." } } };
    emit("registry", { plugins: { fx: { components: { spin: spec }, layers: {}, nodeTypes: {}, materials: {}, textures: {}, passes: {} } }, failures: {} });
    expect(componentSpec("spin")).toEqual(spec);
    expect(plugins.version).toBe(version + 1);
  });

  it("dispatches the page's shortcuts the frame forwards – and drops any other key", async () => {
    const { emit, ready } = make();
    await ready();
    const keys: string[] = [];
    const listener = (event: KeyboardEvent) => keys.push(`${event.ctrlKey ? "ctrl+" : ""}${event.key}`);
    window.addEventListener("keydown", listener);
    const base = { type: "keydown", code: "", shiftKey: false, altKey: false, metaKey: false, repeat: false };
    emit("key", { ...base, key: "e", ctrlKey: false });
    emit("key", { ...base, key: "s", ctrlKey: true });
    emit("key", { ...base, key: "Enter", ctrlKey: true });
    window.removeEventListener("keydown", listener);
    expect(keys).toEqual(["e"]);
  });

  it("keeps the plugins' log lines for the Code tab", async () => {
    const { emit, ready } = make();
    await ready();
    emit("log", { level: "info", text: "[plugin fx] hello" });
    expect(plugins.logs).toEqual([{ level: "info", text: "[plugin fx] hello" }]);
  });

  it("gives a frame that loads again everything the page set: the draft, the overrides, the selection, the spread", async () => {
    const { stage, sent, emit, reply, ready } = make();
    await ready();
    void stage.open("the-door").catch(() => undefined);
    void stage.override("door", DOOR);
    stage.selectNode("door", [0]);
    sent.length = 0;
    emit("ready", null);
    await vi.waitFor(() => expect(sent.some(r => r.method === "init")).toBe(true));
    reply(sent.find(r => r.method === "init")!);
    await vi.waitFor(() => expect(sent.map(r => r.method)).toContain("open"));
    expect(sent.map(r => r.method)).toEqual(expect.arrayContaining(["init", "override", "selectNode", "open"]));
    expect(sent.find(r => r.method === "selectNode")!.args).toEqual(["door", [0]]);
    expect(sent.filter(r => r.method === "open")).toHaveLength(1);
  });

  it("removes the frame and rejects what is pending when disposed", async () => {
    const { stage, frame, ready } = make();
    await ready();
    const tapped = stage.tap("key");
    await stage.dispose();
    expect(frame.isConnected).toBe(false);
    await expect(tapped).resolves.toBe(false);
  });
});
