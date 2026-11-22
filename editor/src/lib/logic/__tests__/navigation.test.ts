import { describe, expect, it } from "vitest";
import type { SelectionState } from "#lib/selection.js";
import { flowOf } from "../flow";
import {
  decodeContext, encodeContext, followSelection, levelName, levelOfSelection, neverFires, parentLevel, pickSelected, searchIndex, searchLogic,
  stageMove, stubNeverFires,
} from "../navigation";
import { project } from "../project";
import type { Context } from "../types";
import { content } from "./fixture";

const sceneSelected: SelectionState = { target: null, node: [], onTarget: true, scene: true };
const nodeSelected = (target: string, node: number[]): SelectionState => ({ target, node, onTarget: false });

describe("the Logic view's level in the URL (#334, ?logic=)", () => {
  const levels: Context[] = [
    { level: "experience" },
    { level: "group", group: "ch1" },
    { level: "scene", scene: "p015" },
    { level: "entity", scene: "p015", target: "p015-1", path: [] },
    { level: "entity", scene: "p015", target: "p015-1", path: [1, 0] },
    { level: "entity", scene: "a:b", target: "t/1 2", path: [3] },
  ];

  it("writes each level compactly and reads it back", () => {
    expect(levels.map(encodeContext)).toEqual([
      "experience", "group:ch1", "scene:p015", "entity:p015:p015-1", "entity:p015:p015-1:1.0", "entity:a%3Ab:t%2F1%202:3",
    ]);
    for (const level of levels) expect(decodeContext(encodeContext(level))).toEqual(level);
  });

  it("reads nothing it does not know", () => {
    for (const bad of [null, "", "experience:x", "group", "group:", "scene", "entity:s", "entity:s:t:1.x", "entity:s:t:-1", "page:3", "scene:%E0%A4%A"]) {
      expect(decodeContext(bad)).toBeNull();
    }
  });
});

describe("moving through the levels (#334)", () => {
  it("goes back up one level by the breadcrumb, none above the experience", () => {
    expect(parentLevel(project(content, { level: "entity", scene: "door", target: "door", path: [] }))).toEqual({ level: "scene", scene: "door" });
    expect(parentLevel(project(content, { level: "scene", scene: "door" }))).toEqual({ level: "group", group: "ch1" });
    expect(parentLevel(project(content, { level: "scene", scene: "epilogue" }))).toEqual({ level: "experience" });
    expect(parentLevel(project(content, { level: "experience" }))).toBeNull();
  });

  it("enters a box's level: a group, a scene, an entity", () => {
    const experience = project(content, { level: "experience" });
    expect(experience.nodes.find(n => n.id === "group:ch1")?.enter).toEqual({ level: "group", group: "ch1" });
    const group = project(content, experience.nodes.find(n => n.id === "group:ch1")!.enter!);
    const scene = project(content, group.nodes.find(n => n.id === "scene:door")!.enter!);
    expect(scene.context).toEqual({ level: "scene", scene: "door" });
    const entity = project(content, scene.nodes.find(n => n.id === "node:door/1")!.enter!);
    expect(entity.levels.map(l => levelName(content, l))).toEqual(["Experience", "Chapter 1", "Door", "door"]);
  });

  it("follows a stub to its far end", () => {
    const scene = project(content, { level: "scene", scene: "door" });
    const hasKey = scene.stubs.find(s => s.label.startsWith("hasKey"))!;
    expect(project(content, hasKey.far).context).toEqual({ level: "scene", scene: "cover" });
    // The far level draws the same name's box: the panel marks it
    expect(project(content, hasKey.far).nodes.some(n => n.id === hasKey.edge.to[0])).toBe(true);
  });

  it("tells the workspace what to do for each level (the stage follows)", () => {
    expect(stageMove({ level: "experience" })).toEqual({ move: "experience" });
    expect(stageMove({ level: "group", group: "ch1" })).toEqual({ move: "group", group: "ch1" });
    expect(stageMove({ level: "scene", scene: "door" })).toEqual({ move: "scene", scene: "door" });
    expect(stageMove({ level: "entity", scene: "door", target: "bell", path: [0] })).toEqual({ move: "node", scene: "door", target: "bell", path: [0] });
  });
});

describe("the view follows the selection (#334, §6.3 the reverse)", () => {
  it("maps a selection to the deepest level that shows it", () => {
    expect(levelOfSelection(sceneSelected, "door")).toEqual({ level: "scene", scene: "door" });
    expect(levelOfSelection(nodeSelected("bell", [0]), "door")).toEqual({ level: "entity", scene: "door", target: "bell", path: [] });
    expect(levelOfSelection({ target: "bell", node: [], onTarget: true }, "door")).toEqual({ level: "entity", scene: "door", target: "bell", path: [] });
    expect(levelOfSelection({ ...sceneSelected, scene: false, group: "ch1" }, "door")).toEqual({ level: "group", group: "ch1" });
    expect(levelOfSelection({ ...sceneSelected, scene: false, experience: true }, "door")).toEqual({ level: "experience" });
    expect(levelOfSelection({ target: "bell", node: [], onTarget: true, entry: "e1" }, "door")).toEqual({ level: "scene", scene: "door" });
  });

  it("stays while one of its boxes stands for the selection: a click on a box does not leave the level", () => {
    const scene = project(content, { level: "scene", scene: "door" });
    // The hint (door/1) is a box of the scene level
    expect(followSelection(scene, nodeSelected("door", [1]), "door")).toEqual(scene.context);
    expect(pickSelected({ kind: "node", target: "door", path: [1] }, nodeSelected("door", [1]), "door", scene)).toBe(true);
    // Another scene's route: the same node path means nothing there
    expect(pickSelected({ kind: "node", target: "door", path: [1] }, nodeSelected("door", [1]), "cover", scene)).toBe(false);
    // The experience shows the open scene as a box: another scene opened from the Scenes panel keeps the experience level
    const experience = project(content, { level: "experience" });
    expect(followSelection(experience, sceneSelected, "epilogue")).toEqual({ level: "experience" });
  });

  it("moves when the selection is not drawn here: another scene, a node without logic, a group", () => {
    const scene = project(content, { level: "scene", scene: "door" });
    expect(followSelection(scene, sceneSelected, "cover")).toEqual({ level: "scene", scene: "cover" });
    expect(followSelection(scene, nodeSelected("bell", [5]), "door")).toEqual({ level: "entity", scene: "door", target: "bell", path: [] });
    expect(followSelection(scene, { ...sceneSelected, scene: false, group: "ch1" }, "door")).toEqual({ level: "group", group: "ch1" });
    // From an entity level back to the scene when the scene is selected
    const entity = project(content, { level: "entity", scene: "door", target: "door", path: [] });
    expect(followSelection(entity, sceneSelected, "door")).toEqual({ level: "scene", scene: "door" });
  });

  it("keeps an entity's subtree level while a node inside it is selected", () => {
    const hint = project(content, { level: "entity", scene: "door", target: "door", path: [1] });
    expect(followSelection(hint, nodeSelected("door", [1]), "door")).toEqual(hint.context);
    expect(followSelection(hint, nodeSelected("door", [0]), "door")).toEqual({ level: "entity", scene: "door", target: "door", path: [] });
  });
});

describe("events between scenes never fire (#334, the engine builds only the open scene's rules)", () => {
  it("marks event wires between two scenes, not those to a plugin or variables", () => {
    const experience = project(content, { level: "experience" });
    const marked = experience.edges.filter(neverFires).map(e => `${e.from[0]} > ${e.to[0]}`);
    expect(marked).toEqual(["scene:cover > scene:door", "scene:door > scene:epilogue"]);
  });

  it("marks a scene's event stubs to another scene, not a value stub or one to another target of the same scene", () => {
    const scene = project(content, { level: "scene", scene: "door" });
    expect(scene.stubs.filter(s => stubNeverFires(s, scene)).map(s => s.label).sort()).toEqual(["keyRattled ← emitted in Cover", "openDoor → listened to in Epilogue"]);
    const entity = project(content, { level: "entity", scene: "door", target: "door", path: [] });
    expect(entity.stubs.filter(s => stubNeverFires(s, entity)).map(s => s.label)).toEqual(["openDoor → listened to in Epilogue"]);
  });

  it("draws them in the flow: the stubs at the border, every wire on a port of its box", () => {
    const scene = project(content, { level: "scene", scene: "door" });
    const flow = flowOf(scene);
    const stubs = flow.boxes.filter(b => b.stub);
    expect(stubs).toHaveLength(3);
    const xs = flow.boxes.filter(b => b.node).map(b => b.x);
    for (const s of stubs) {
      if (s.stub!.side === "in") expect(s.x).toBeLessThan(Math.min(...xs));
      else expect(s.x).toBeGreaterThan(Math.max(...xs));
    }
    const ports = new Map(flow.boxes.map(b => [b.id, new Set(b.ports.map(p => `${p.dir}:${p.id}`))]));
    for (const w of flow.wires) {
      expect(ports.get(w.source)?.has(w.sourcePort)).toBe(true);
      expect(ports.get(w.target)?.has(w.targetPort)).toBe(true);
    }
    expect(flow.wires.filter(w => w.never).map(w => w.label).sort()).toEqual(["keyRattled", "openDoor"]);
  });
});

describe("searching the experience's logic (#334)", () => {
  const index = searchIndex(content);

  it("finds a box on the experience level and on each scene level", () => {
    const hits = searchLogic(index, "haskey");
    expect(hits.map(h => `${encodeContext(h.context)} ${h.node}`)).toEqual([
      "experience var:hasKey", "scene:cover var:hasKey", "scene:door var:hasKey",
      // The door's second rule reads hasKey in its condition (its detail)
      "scene:door rule:door/#1",
    ]);
  });

  it("puts label hits first, then the detail and the place; nothing for no words", () => {
    const hits = searchLogic(index, "bell");
    expect(hits[0].label.toLowerCase()).toContain("bell");
    expect(searchLogic(index, "  ")).toEqual([]);
    expect(searchLogic(index, "nothing like it")).toEqual([]);
    expect(searchLogic(index, "door", 2)).toHaveLength(2);
  });
});
