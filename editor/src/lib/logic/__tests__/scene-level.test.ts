import { describe, expect, it } from "vitest";
import type { EntityData, PluginData } from "@engine/types";
import { layoutLogic } from "../layout";
import { pluginCodeUses } from "../plugin-code";
import { conditionWords, project, type LogicContent, type LogicScene, type LogicTarget } from "../project";

/** The scene level as plain boxes and `from → to` wires (each pair and word once), the shape these tests read */
interface LogicGraph {
  nodes: Array<{ id: string; kind: string; label: string; detail: string; pick: unknown; problem?: string }>;
  edges: Array<{ from: string; to: string; label: string }>;
  /** A display row's references (#334): `from|row|to` */
  refs: string[];
  problems: string[];
}
const sceneLogic = (content: LogicContent, sceneId: string): LogicGraph => {
  const view = project(content, { level: "scene", scene: sceneId });
  const edges: LogicGraph["edges"] = [];
  for (const e of view.edges) {
    if (!edges.some(known => known.from === e.from[0] && known.to === e.to[0] && known.label === e.label)) edges.push({ from: e.from[0], to: e.to[0], label: e.label });
  }
  return {
    nodes: view.nodes.map(({ id, kind, label, detail, pick, problem }) => ({ id, kind, label, detail, pick, ...(problem ? { problem } : {}) })),
    edges,
    refs: view.refs.map(r => `${r.from[0]}|${r.from[1]}|${r.to}`),
    problems: view.problems.map(p => p.message),
  };
};

// The demo experience's two scenes (fixtures/demo): the key sets hasKey and emits keyRattled; the door shows its hint,
// and with hasKey hides it and emits openDoor – the door plugin listens to it, sets doorOpen and emits doorOpened
const key: EntityData = {
  type: "model", assets: [],
  components: [
    { type: "spin", degreesPerSecond: 40 },
    { type: "animation", clip: "rattle" },
    { type: "behaviour", rules: [{ on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "experience" }, { emit: "keyRattled" }] }] },
  ],
};
const door: EntityData = {
  type: "group", assets: [],
  children: [
    { type: "model", name: "door", assets: [] },
    { type: "text", name: "hint", assets: [], text: "Tap the key" },
  ],
  components: [
    { type: "door", lift: 0.35 },
    { type: "behaviour", rules: [{ on: "found", do: { show: "hint" } }, { on: "found", when: "hasKey", do: [{ hide: "hint" }, { emit: "openDoor" }] }] },
  ],
};
const plugins: PluginData[] = [{ id: "narrative", src: "/p.js", api: "3.0", registered: { components: { door: { params: {} }, spin: { params: {} } } } } as unknown as PluginData];
const narrativeSource = `
  api.registerComponent("door", { onAttach() {
    api.vars.set("doorOpen", true, "stage");
    api.events.emit("doorOpened", { by: "key" });
    const offOpen = api.events.on('openDoor', () => {});
  } });
  const lit = () => api.vars.get("doorOpen") === true;`;

const scene = (id: string, targets: LogicTarget[]): LogicScene => ({ id, label: id, targets });
const ids = (graph: LogicGraph, kind: string) => graph.nodes.filter(n => n.kind === kind).map(n => n.id).sort();
const has = (graph: LogicGraph, from: string, to: string, label: string) => graph.edges.some(e => e.from === from && e.to === to && e.label === label);

describe("a scene's logic as a graph (#239)", () => {
  it("reads what a plugin's code listens to, emits, reads and sets", () => {
    expect(pluginCodeUses(narrativeSource)).toEqual({ listens: ["openDoor"], emits: ["doorOpened"], reads: ["doorOpen"], sets: ["doorOpen"] });
    expect(pluginCodeUses("api.events.emit(name)")).toEqual({ listens: [], emits: [], reads: [], sets: [] });
  });

  it("draws a rule from its node's event to what it sets, emits and plays", () => {
    const graph = sceneLogic({ scenes: [scene("cover", [{ id: "key", entity: key }])], plugins }, "cover");
    expect(ids(graph, "rule")).toEqual(["rule:key/#0"]);
    expect(has(graph, "event:key/:tap", "rule:key/#0", "on")).toBe(true);
    expect(has(graph, "rule:key/#0", "var:hasKey", "set = true")).toBe(true);
    expect(has(graph, "rule:key/#0", "event:keyRattled", "emit")).toBe(true);
    expect(has(graph, "rule:key/#0", "node:key/", "play rattle")).toBe(true);
    // The spin component is the narrative plugin's: it drives the key's node
    expect(graph.refs).toContain("plugin:narrative|drives|node:key/");
    expect(graph.nodes.find(n => n.id === "var:hasKey")?.detail).toBe("variable · experience");
    expect(graph.nodes.find(n => n.id === "event:key/:tap")?.pick).toEqual({ kind: "node", target: "key", path: [] });
  });

  it("resolves the nodes a rule acts on by name in its subtree, and links the plugins' code to the rules' events", () => {
    const graph = sceneLogic({ scenes: [scene("cover", [{ id: "key", entity: key }]), scene("door", [{ id: "door", entity: door }])], plugins, code: { narrative: pluginCodeUses(narrativeSource) } }, "door");
    expect(has(graph, "rule:door/#0", "node:door/1", "show")).toBe(true);
    expect(has(graph, "rule:door/#1", "node:door/1", "hide")).toBe(true);
    expect(has(graph, "var:hasKey", "rule:door/#1", "when")).toBe(true);
    expect(has(graph, "event:openDoor", "plugin:narrative", "listens")).toBe(true);
    expect(has(graph, "plugin:narrative", "event:doorOpened", "emits")).toBe(true);
    // What it sets and drives: display rows with references, not wires (#334)
    expect(has(graph, "plugin:narrative", "var:doorOpen", "sets")).toBe(false);
    expect(graph.refs).toEqual(expect.arrayContaining(["plugin:narrative|sets|var:doorOpen", "plugin:narrative|reads|var:doorOpen", "plugin:narrative|drives|node:door/"]));
    expect(graph.nodes.find(n => n.id === "node:door/1")).toMatchObject({ label: "hint", pick: { kind: "node", target: "door", path: [1] } });
    expect(graph.nodes.find(n => n.id === "rule:door/#1")?.detail).toBe("hasKey");
    // hasKey is set on the key's scene, openDoor listened to by the plugin: no problem – doorOpened is listened to by nothing
    expect(graph.problems).toEqual(["doorOpened is emitted, but nothing in the experience listens to it"]);
  });

  it("names the problems: a variable nothing sets, an event nothing emits, a node an action names that is not there", () => {
    const lonely: EntityData = {
      type: "group", assets: [],
      components: [{ type: "behaviour", rules: [{ on: "doorOpened", when: "tries == 1", do: { show: "ghost" } }] }],
    };
    const graph = sceneLogic({ scenes: [scene("s", [{ id: "t", entity: lonely }])] }, "s");
    expect(graph.problems).toEqual([
      "group, rule 1: show names ghost – no node of that name under group",
      "doorOpened is listened to, but nothing in the experience emits it – its rules never fire",
      "tries is read, but nothing in the experience sets it",
    ]);
    expect(graph.nodes.find(n => n.id === "var:tries")?.problem).toBeTruthy();
    expect(conditionWords("a == 1 || !b")).toBe("a == 1 || !b");
    expect(conditionWords(null)).toBe("always");
  });

  it("keeps quiet about events and variables while a plugin's code is unknown", () => {
    const node: EntityData = { type: "group", assets: [], components: [{ type: "behaviour", rules: [{ on: "lost", when: "mode == \"a\"", do: { emit: "nobodyListens" } }] }] };
    const graph = sceneLogic({ scenes: [scene("s", [{ id: "n", entity: node }])], plugins }, "s");
    expect(graph.problems).toEqual([]);
    expect(graph.nodes.find(n => n.id === "plugin:narrative")).toBeUndefined();
    expect(sceneLogic({ scenes: [scene("s", [{ id: "n", entity: node }])] }, "s").problems).toEqual([
      "mode is read, but nothing in the experience sets it",
      "nobodyListens is emitted, but nothing in the experience listens to it",
    ]);
  });

  it("leaves out targets without entities and nodes without logic", () => {
    const plain: EntityData = { type: "model", assets: [], children: [{ type: "text", assets: [], text: "x" }] };
    expect(sceneLogic({ scenes: [scene("s", [{ id: "a" }, { id: "b", entity: plain }])] }, "s")).toEqual({ nodes: [], edges: [], refs: [], problems: [] });
  });
});

describe("the logic graph's layout (#239)", () => {
  it("puts each node one column after its sources, centres the columns and loops the back edges", () => {
    const layout = layoutLogic(["a", "b", "c", "d"], [
      { from: "a", to: "b", label: "" }, { from: "b", to: "c", label: "" }, { from: "a", to: "c", label: "" }, { from: "c", to: "a", label: "loop" }, { from: "d", to: "c", label: "" },
    ], { w: 100, h: 20, gapX: 50, gapY: 10 });
    expect(layout.nodes.a.column).toBe(0);
    expect(layout.nodes.b.column).toBe(1);
    expect(layout.nodes.c.column).toBe(2);
    expect(layout.nodes.d.column).toBe(0);
    expect(layout.nodes.c.x).toBe(300);
    expect(layout.width).toBe(400);
    // Column 1 holds one node, centred on column 0's two
    expect(layout.nodes.b.y).toBe(15);
    const loop = layout.edges.find(e => e.label === "loop")!;
    expect(loop.back).toBe(true);
    expect(layout.height).toBeGreaterThan(50);
    expect(layout.edges.filter(e => !e.back)).toHaveLength(4);
  });

  it("is empty for an empty graph and skips edges to unknown nodes", () => {
    expect(layoutLogic([], [])).toEqual({ nodes: {}, edges: [], width: 0, height: 0 });
    expect(layoutLogic(["a"], [{ from: "a", to: "zz", label: "" }]).edges).toEqual([]);
  });
});
