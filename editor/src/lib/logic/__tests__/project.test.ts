import { describe, expect, it } from "vitest";
import { levelsOf, project } from "../project";
import { CORE_TYPES, NodeRegistry, rulePorts } from "../registry";
import type { View } from "../types";
import { content } from "./fixture";

const edge = (view: View, from: string, to: string) => view.edges.filter(e => e.from[0] === from && e.to[0] === to);
const stubLabels = (view: View) => view.stubs.map(s => s.label).sort();

describe("the node type registry (#334)", () => {
  it("derives a rule's ports from the grammar: on, when, and one do outlet per action by verb", () => {
    expect(rulePorts({ do: [{ action: "set", name: "a", value: "true", scope: "scene" }, { action: "emit", event: "b" }, { action: "show", node: "" }] })).toEqual([
      { id: "on", label: "on", signal: "event", dir: "in" },
      { id: "when", label: "when", signal: "value", dir: "in", many: true },
      { id: "do:0", label: "set", signal: "value", dir: "out" },
      { id: "do:1", label: "emit", signal: "event", dir: "out" },
      { id: "do:2", label: "show", signal: "node", dir: "out" },
      { id: "do", label: "+", signal: "node", dir: "out", many: true },
    ]);
  });

  it("holds the core's families and verbs, and takes a title's or a plugin's types once", () => {
    const registry = new NodeRegistry();
    expect(registry.get("goto")).toMatchObject({ family: "action", owner: "core" });
    expect(registry.ports("goto", undefined).find(p => p.dir === "out")?.signal).toBe("scene");
    expect(CORE_TYPES.every(t => t.owner === "core")).toBe(true);
    registry.register({ kind: "note", family: "free", owner: "narrative", ports: () => [] });
    expect(registry.get("note")?.owner).toBe("narrative");
    expect(() => registry.register({ kind: "rule", family: "rule", owner: "narrative", ports: () => [] })).toThrow(/already registered by core/);
    expect(registry.ports("unknown", {})).toEqual([]);
  });
});

describe("the logic view per level (#334)", () => {
  it("names the levels from the experience down", () => {
    expect(levelsOf(content, { level: "entity", scene: "door", target: "door", path: [1] })).toEqual([
      { level: "experience" }, { level: "group", group: "ch1" }, { level: "scene", scene: "door" },
      { level: "entity", scene: "door", target: "door", path: [] }, { level: "entity", scene: "door", target: "door", path: [1] },
    ]);
    expect(levelsOf(content, { level: "scene", scene: "epilogue" })).toEqual([{ level: "experience" }, { level: "scene", scene: "epilogue" }]);
  });

  it("the scene level: boxes with ports, each edge with its document place, boxes that open the entity level", () => {
    const view = project(content, { level: "scene", scene: "door" });
    expect(view.levels).toEqual([{ level: "experience" }, { level: "group", group: "ch1" }, { level: "scene", scene: "door" }]);
    const rule = view.nodes.find(n => n.id === "rule:door/#1")!;
    expect(rule.ports.map(p => p.id)).toEqual(["on", "when", "do:0", "do:1", "do"]);
    expect(edge(view, "var:hasKey", "rule:door/#1")).toEqual([{
      id: "var:hasKey:get>rule:door/#1:when", from: ["var:hasKey", "get"], to: ["rule:door/#1", "when"], signal: "value", label: "when",
      home: { doc: "entity", target: "door", path: [], component: 1, rule: 1, part: "when", index: 0 },
    }]);
    expect(edge(view, "rule:door/#1", "event:openDoor")[0]).toMatchObject({ from: ["rule:door/#1", "do:1"], to: ["event:openDoor", "in"], home: { part: "do", index: 1 } });
    // Two rules hide the hint: two edges, one per document place
    expect(edge(view, "rule:door/#1", "node:door/1")).toHaveLength(1);
    expect(edge(view, "rule:door/#2", "node:door/1")).toHaveLength(1);
    // A plugin's use is derived: no home
    expect(edge(view, "plugin:narrative", "node:door/")[0]).toMatchObject({ label: "door", home: null });
    expect(view.nodes.find(n => n.id === "node:door/1")?.enter).toEqual({ level: "entity", scene: "door", target: "door", path: [] });
    expect(view.canvas).toEqual({ nodes: [], wires: [] });
  });

  it("the scene level's stubs: what other scenes set, emit, read and hear of its names", () => {
    const view = project(content, { level: "scene", scene: "door" });
    // bellRang joins two targets of this scene: inside. rung is the scene's own: it never reaches the Epilogue.
    expect(stubLabels(view)).toEqual(["hasKey ← set in Cover", "keyRattled ← emitted in Cover", "openDoor → heard in Epilogue"]);
    const hasKey = view.stubs.find(s => s.label.startsWith("hasKey"))!;
    expect(hasKey).toMatchObject({ side: "in", far: { level: "scene", scene: "cover" } });
    expect(hasKey.edge).toMatchObject({ from: ["far:target:cover/key", "sets"], to: ["var:hasKey", "set"], signal: "value", home: null });
    // The Cover's key: hasKey is read by the Door's rule and the Epilogue's text
    expect(stubLabels(project(content, { level: "scene", scene: "cover" }))).toEqual([
      "hasKey → read in Door", "hasKey → read in the texts of Epilogue", "keyRattled → heard in Door",
    ]);
  });

  it("the entity level: one target's rules, stubs to the scene's other targets and to other scenes", () => {
    const view = project(content, { level: "entity", scene: "door", target: "door", path: [] });
    expect(view.nodes.filter(n => n.kind === "rule").map(n => n.id)).toEqual(["rule:door/#0", "rule:door/#1", "rule:door/#2"]);
    expect(view.nodes.some(n => n.id.startsWith("rule:bell"))).toBe(false);
    expect(view.nodes.every(n => !n.enter)).toBe(true);
    expect(stubLabels(view)).toEqual(["bellRang ← emitted in target bell", "hasKey ← set in Cover", "openDoor → heard in Epilogue"]);
    expect(view.stubs.find(s => s.label.startsWith("bellRang"))?.far).toEqual({ level: "entity", scene: "door", target: "bell", path: [] });
    // A subtree: the hint has no rules of its own – its box with the ports its spec gives (L-T6), every one hidden: none is wired
    const hint = project(content, { level: "entity", scene: "door", target: "door", path: [1] });
    expect(hint.nodes.map(n => n.id)).toEqual(["node:door/1"]);
    expect(hint.nodes[0].ports.filter(p => p.kind).every(p => p.hidden)).toBe(true);
    expect(hint.levels).toHaveLength(5);
  });

  it("the group level: its scenes, the joins between them, stubs to scenes outside and plugins", () => {
    const view = project(content, { level: "group", group: "ch1" });
    expect(view.nodes.map(n => [n.id, n.detail, n.enter])).toEqual([
      ["scene:cover", "1 rule", { level: "scene", scene: "cover" }],
      ["scene:door", "4 rules", { level: "scene", scene: "door" }],
    ]);
    expect(view.edges.map(e => [e.id, e.label, e.home])).toEqual([
      ["scene:cover:sets>scene:door:reads", "hasKey", null],
      ["scene:cover:emits>scene:door:hears", "keyRattled", null],
    ]);
    expect(stubLabels(view)).toEqual(["hasKey → read in Epilogue", "openDoor → heard in Epilogue", "openDoor → heard in plugin narrative"]);
    expect(view.stubs.find(s => s.label.endsWith("plugin narrative"))?.far).toEqual({ level: "experience" });
    expect(view.problems).toEqual([{ message: "doorOpened is emitted, but nothing in the experience hears it", node: "scene:door" }]);
  });

  it("the experience level: groups as frames, scenes in order, plugins, crossing variables, core events, events between places", () => {
    const view = project(content, { level: "experience" });
    expect(view.levels).toEqual([{ level: "experience" }]);
    expect(view.stubs).toEqual([]);
    expect(view.nodes.map(n => n.id)).toEqual([
      "group:ch1", "scene:cover", "scene:door", "scene:epilogue", "plugin:narrative", "var:hasKey", "var:doorOpen", "event:sceneChanged",
    ]);
    expect(view.nodes.find(n => n.id === "scene:door")).toMatchObject({ group: "group:ch1", pick: { kind: "scene", scene: "door" } });
    expect(view.nodes.find(n => n.id === "scene:epilogue")?.group).toBeUndefined();
    expect(view.nodes.find(n => n.id === "group:ch1")).toMatchObject({ detail: "2 scenes", enter: { level: "group", group: "ch1" } });
    expect(view.nodes.find(n => n.id === "var:doorOpen")?.detail).toBe("variable · plugin");
    const labels = view.edges.map(e => `${e.from[0]} > ${e.to[0]}: ${e.label}`);
    expect(labels).toEqual([
      "scene:cover > var:hasKey: sets",
      "var:hasKey > scene:door: reads",
      "event:sceneChanged > scene:epilogue: on",
      "var:hasKey > scene:epilogue: reads",
      "plugin:narrative > var:doorOpen: sets",
      "scene:cover > scene:door: keyRattled",
      "scene:door > scene:epilogue: openDoor",
      "scene:door > plugin:narrative: openDoor",
    ]);
    expect(view.edges.every(e => e.home === null)).toBe(true);
    expect(view.problems.map(p => p.message)).toEqual(["doorOpened is emitted, but nothing in the experience hears it"]);
  });

  it("an unknown scene is an empty view that still names its levels", () => {
    const view = project(content, { level: "scene", scene: "gone" });
    expect(view).toMatchObject({ nodes: [], edges: [], stubs: [], problems: [] });
    expect(view.levels).toEqual([{ level: "experience" }, { level: "scene", scene: "gone" }]);
  });
});
