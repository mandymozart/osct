import { afterEach, describe, expect, it, vi } from "vitest";
import { componentSpec, type EntityData } from "@engine/types";
import { installedPlugins, installPlugin, loadPlugins } from "@engine/scene/plugins";
import { PLUGIN_API_VERSION } from "@engine/types";
import { plugins } from "../../plugins.svelte";
import type { GizmoPlacement } from "../gizmo";
import type { StagePick } from "../pick";
import type { StageCore } from "../stage-core.svelte";
import { Stage } from "../stage.svelte";

/**
 * The stage in the editor's page (#340 – the stage frame of #234 is gone): the workspace's `Stage` drives the engine's
 * `StageCore` directly. A stand-in core here (the test environment has no WebGL) records what it is asked and lets the
 * test play the stage's side: a gizmo drag, a pick, a plugin's log line.
 */

const DOOR: EntityData = { type: "group", assets: [], children: [{ type: "model", name: "door", assets: [], params: { position: [0, 0, 0] } }] };
const SPIN = { description: "Spins.", params: { speed: { kind: "number" as const, default: 1, min: 0, max: 5, description: "Speed." } } };

/** What the workspace asks of the core, and the core's callbacks for the test to fire */
class FakeCore {
  status = "idle";
  error = null;
  sceneId: string | null = null;
  found: string[] = [];
  subtitle = null;
  pickFilter = [];
  shading = "lit";
  world = false;
  tool = "select";
  vars = [];
  events = [];
  calls: Array<[string, ...unknown[]]> = [];
  onPick: ((hit: StagePick | null) => void) | null = null;
  onContextMenu: ((hit: StagePick | null, x: number, y: number) => void) | null = null;
  onGhostChange = null;
  onSurfacePick = null;
  onSurfacePlace: ((surfaceId: string, place: unknown) => void) | null = null;
  onPlacement: ((selection: { targetId: string; path: number[] }, placement: GizmoPlacement) => void) | null = null;
  constructor(public host: HTMLElement) {}
  private record(name: string, ...args: unknown[]) { this.calls.push([name, ...args]); }
  async open(sceneId: string) { this.record("open", sceneId); this.sceneId = sceneId; }
  async refresh() { this.record("refresh"); }
  override(targetId: string, entity: EntityData | null) { this.record("override", targetId, entity); }
  selectNode(targetId: string | null, path: number[]) { this.record("selectNode", targetId, path); }
  setSurfaceGizmo(surfaceId: string | null, mode: string) { this.record("setSurfaceGizmo", surfaceId, mode); }
  sampleColor(x: number, y: number) { this.record("sampleColor", x, y); return "#102030"; }
  tap(targetId: string) { this.record("tap", targetId); return true; }
  fire(event: string, payload?: unknown) { this.record("fire", event, payload); return event === "varChanged" ? "\"varChanged\" is a core event" : null; }
  runRule(home: unknown, rule: number) { this.record("runRule", home, rule); return "ran"; }
  elapsed() { return 1234; }
  async dispose() { this.record("dispose"); }
}

let stages: Stage[] = [];

const make = () => {
  const container = document.createElement("div");
  const toolbar = document.createElement("nav");
  container.append(toolbar);
  document.body.append(container);
  let core: FakeCore | null = null;
  const stage = new Stage(container, host => (core = new FakeCore(host)) as unknown as StageCore);
  stages.push(stage);
  return { stage, core: core! as FakeCore, container, toolbar };
};

afterEach(async () => {
  await Promise.all(stages.map(stage => stage.dispose()));
  stages = [];
  plugins.logs = [];
  plugins.journal = [];
  vi.restoreAllMocks();
});

describe("the stage in the editor's page", () => {
  it("runs in a layer of its own at the bottom of the stage's container – no frame", () => {
    const { container, core, toolbar } = make();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.firstElementChild).toBe(core.host);
    expect(core.host.className).toBe("stage-host");
    expect(core.host.nextElementSibling).toBe(toolbar);
  });

  it("calls the stage directly: a scene opens, a tap, the eyedropper's colour", async () => {
    const { stage, core } = make();
    await stage.open("the-key");
    expect(core.calls).toContainEqual(["open", "the-key"]);
    expect(stage.sceneId).toBe("the-key");
    await expect(stage.tap("key")).resolves.toBe(true);
    await expect(stage.sampleColor(4, 5)).resolves.toBe("#102030");
  });

  it("hands the Logic panel's tests on the stage to the core: an event fired, a rule run (#334)", () => {
    const { stage, core } = make();
    expect(stage.fire("doorOpened", { door: "front" })).toBeNull();
    expect(stage.fire("varChanged")).toContain("core event");
    expect(stage.runRule({ home: "experience" }, 0)).toBe("ran");
    expect(core.calls).toContainEqual(["fire", "doorOpened", { door: "front" }]);
    expect(core.calls).toContainEqual(["runRule", { home: "experience" }, 0]);
  });

  it("starts once: the kept plugins are marked before the first scene loads its plugins, then onStarted", async () => {
    const { stage } = make();
    const started = vi.fn();
    stage.onStarted = started;
    stage.keptPlugins = () => ["fx"];
    await stage.open("a");
    await stage.open("b");
    expect(started).toHaveBeenCalledTimes(1);
    // The content's module of a kept id is not loaded over the saved source
    const importer = vi.fn(async () => ({ register: () => undefined }));
    await loadPlugins([{ id: "fx", src: "/p/fx/plugin.js", api: PLUGIN_API_VERSION }], importer);
    expect(importer).not.toHaveBeenCalled();
  });

  it("builds the first scene only after the saved sources are installed – its nodes find what they register (#340)", async () => {
    const { stage, core } = make();
    let release!: () => void;
    const order: string[] = [];
    stage.onStarted = () => new Promise<void>(resolve => {
      release = () => {
        installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
        order.push("plugins");
        resolve();
      };
    });
    const opening = stage.open("a");
    // A second open while the code loads waits too
    const again = stage.open("b");
    await Promise.resolve();
    expect(core.calls.filter(c => c[0] === "open")).toEqual([]);
    expect(stage.sceneId).toBe("b");
    release();
    await Promise.all([opening, again]);
    order.push(...core.calls.filter(c => c[0] === "open").map(c => `open ${c[1]}`));
    expect(order).toEqual(["plugins", "open a", "open b"]);
  });

  it("tells the panels to read the registry again only when it changed", async () => {
    const { stage } = make();
    await stage.open("a");
    await new Promise(resolve => setTimeout(resolve));
    const version = plugins.version;
    void stage.override("door", DOOR);
    void stage.override("door", { ...DOOR, name: "again" });
    await new Promise(resolve => setTimeout(resolve));
    expect(plugins.version).toBe(version);
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
    void stage.override("door", DOOR);
    await new Promise(resolve => setTimeout(resolve));
    expect(plugins.version).toBe(version + 1);
  });

  it("writes a gizmo's placement into the page's own override and hands it to the stage", () => {
    const { stage, core } = make();
    void stage.override("door", DOOR);
    stage.selectNode("door", [0]);
    core.onPlacement!({ targetId: "door", path: [0] }, { position: [0.2, 0, 0], rotation: [0, 45, 0], scale: 2 });
    const node = stage.overrideOf("door")!.children![0];
    expect(node.params).toMatchObject({ position: [0.2, 0, 0], rotation: [0, 45, 0], scale: 2 });
    expect(core.calls.filter(c => c[0] === "override").at(-1)).toEqual(["override", "door", stage.overrideOf("door")]);
  });

  it("takes a placement only for the node the page selected – the gizmo sits on no other (#259: a live tree is saved by itself)", () => {
    const { stage, core } = make();
    void stage.override("door", DOOR);
    const moved: GizmoPlacement = { position: [0.2, 0, 0], rotation: [0, 45, 0], scale: 2 };
    core.onPlacement!({ targetId: "door", path: [0] }, moved);
    stage.selectNode("door", []);
    core.onPlacement!({ targetId: "door", path: [0] }, moved);
    stage.selectNode("window", [0]);
    core.onPlacement!({ targetId: "door", path: [0] }, moved);
    expect(stage.overrideOf("door")).toBe(DOOR);
  });

  it("adopts a saved tree: no rebuild, the tree is no override any more – unless it was edited again", async () => {
    const { stage, core } = make();
    void stage.override("door", DOOR);
    await stage.adopt("door", DOOR);
    expect(stage.overrideOf("door")).toBeUndefined();
    expect(core.calls.filter(c => c[0] === "refresh")).toEqual([]);
    expect(core.calls.filter(c => c[0] === "override")).toHaveLength(1);
    const edited = { ...DOOR, name: "edited" };
    void stage.override("door", DOOR);
    void stage.override("door", edited);
    await stage.adopt("door", DOOR);
    expect(stage.overrideOf("door")).toBe(edited);
  });

  it("removes an entity as the REMOVED marker, the same object on both sides", () => {
    const { stage, core } = make();
    void stage.override("door", DOOR);
    stage.removeNode("door", []);
    expect(stage.treeOf("door")).toBeUndefined();
    expect(core.calls.at(-1)).toEqual(["override", "door", Stage.REMOVED]);
  });

  it("passes on a surface gizmo's drag only for the surface the page asked for", () => {
    const { stage, core } = make();
    const placed = vi.fn();
    stage.onSurfacePlace = placed;
    const place = { x: 1, y: 2, z: 3, rx: 0, ry: 0, rz: 0 };
    core.onSurfacePlace!("wall", place);
    stage.setSurfaceGizmo("wall", "rotate");
    core.onSurfacePlace!("wall", place);
    core.onSurfacePlace!("floor", place);
    expect(placed.mock.calls).toEqual([["wall", place]]);
  });

  it("keeps the plugins' log lines for the Code tab and the Log tab, with the timeline's clock – and no other line", () => {
    make();
    vi.spyOn(performance, "now").mockReturnValue(5000);
    console.info("[plugin fx] hello", { n: 1 });
    console.warn("[plugins] fx: the listener for \"tap\" failed:", new Error("boom"));
    console.info("the editor's own line");
    expect(plugins.logs).toEqual([
      { level: "info", text: "[plugin fx] hello {\"n\":1}", t: 5000, at: 1234 },
      { level: "warn", text: "[plugins] fx: the listener for \"tap\" failed: Error: boom", t: 5000, at: 1234 },
    ]);
    expect(plugins.journal).toHaveLength(2);
  });

  it("closing it gives the console back, removes its layer and empties the registry – the draft's recorded specs stay known", async () => {
    const original = console.info;
    const { stage, core } = make();
    expect(console.info).not.toBe(original);
    installPlugin("fx", { register: api => api.registerComponent("spin", SPIN, () => ({})) });
    expect(componentSpec("spin")).toBeDefined();
    await stage.dispose();
    expect(console.info).toBe(original);
    expect(core.host.isConnected).toBe(false);
    expect(core.calls.at(-1)).toEqual(["dispose"]);
    expect(installedPlugins()).toEqual([]);
    expect(componentSpec("spin")).toBeUndefined();
  });
});
