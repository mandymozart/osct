import { describe, expect, it } from "vitest";
import { apply, type OpResult } from "../apply";
import { addChoices } from "../palette";
import { logicTypes, project, typeProblemsByRule, type LogicContent } from "../project";
import type { Context } from "../types";
import { content as base } from "./fixture";

// The fixture with a scene's and the experience's rules (content schema 5.0, #334 L-T5b): the door scene shows its hint on
// doorOpened when hasKey and goes to the Epilogue; the experience sets chapterDone and goes to the Epilogue once visits > 1.
const content: LogicContent = {
  ...base,
  scenes: base.scenes.map(s => (s.id !== "door" ? s : {
    ...s, rules: [{ on: "doorOpened", when: "hasKey", do: [{ action: "show", node: "target:door/hint" }, { action: "goto", address: "scene:epilogue" }] }],
  })),
  rules: [{ on: "targetUnlocked", when: "visits > 1", do: [{ action: "set", name: "chapterDone", value: "true", scope: "experience" }, { action: "goto", address: "scene:epilogue" }] }],
  variables: { visits: { type: "integer", scope: "experience", default: 0 }, mood: { type: "string", default: "calm" } },
};

const scene: Context = { level: "scene", scene: "door" };
const experience: Context = { level: "experience" };
const ok = (result: OpResult) => {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
};
const refused = (result: OpResult) => {
  if (result.ok) throw new Error(`applied: ${result.words}`);
  return result.reason;
};
const sceneRules = (c: LogicContent) => c.scenes.find(s => s.id === "door")!.rules!;

describe("scene rules in the Logic view (#334 L-T5b)", () => {
  it("draws a scene's rule with its event, the variables its condition reads, the node it names by address and a goto stub", () => {
    const view = project(content, scene);
    const box = view.nodes.find(n => n.id === "rule:scene:door#0")!;
    expect(box).toMatchObject({ label: "scene rule 1", detail: "hasKey", home: { doc: "scene", scene: "door", rule: 0, part: "on" } });
    expect(view.edges.find(e => e.from[0] === "var:hasKey" && e.to[0] === box.id)?.home).toMatchObject({ doc: "scene", part: "when", index: 0 });
    expect(view.edges.find(e => e.from.join() === `${box.id},do:0`)).toMatchObject({ to: ["node:door/1", "act:show"], label: "show", signal: "node" });
    const goto = view.stubs.find(s => s.label === "→ Epilogue · goto")!;
    expect(goto).toMatchObject({ side: "out", far: { level: "scene", scene: "epilogue" } });
    expect(goto.edge).toMatchObject({ signal: "scene", home: { doc: "scene", part: "do", index: 1 } });
  });

  it("an entity rule's goto is a stub too, and the experience level draws the derived goto between the scenes", () => {
    const withEntityGoto: LogicContent = {
      ...content,
      scenes: content.scenes.map(s => (s.id !== "cover" ? s : { ...s, targets: [{ id: "key", entity: { type: "model", assets: [], components: [{ type: "behaviour", rules: [{ on: "tap", do: { goto: "scene:door" } }] }] } }] })),
    };
    expect(project(withEntityGoto, { level: "scene", scene: "cover" }).stubs.map(s => s.label)).toContain("→ Door · goto");
    const top = project(withEntityGoto, experience);
    expect(top.edges.find(e => e.from[0] === "scene:cover" && e.to[0] === "scene:door" && e.signal === "scene")).toMatchObject({ signal: "scene", label: "goto", home: null });
    expect(top.edges.find(e => e.from[0] === "scene:door" && e.to[0] === "scene:epilogue" && e.signal === "scene")).toMatchObject({ signal: "scene", label: "goto" });
  });

  it("edits a scene's rules as it edits a node's: the op says which list changed, no tree", () => {
    const removed = ok(apply({ op: "removeRule", home: { doc: "scene", scene: "door", rule: 0, part: "on" } }, content, scene));
    expect(removed.changed).toEqual([]);
    expect(removed.logic).toEqual([{ doc: "scene", scene: "door", rules: [] }]);
    const added = ok(apply({ op: "addRule", at: { doc: "scene", scene: "door" } }, content, scene));
    expect(sceneRules(added.content).at(-1)).toEqual({ on: "sceneChanged", when: null, do: [] });
    expect(added.words).toMatch(/^Added scene rule 2: on sceneChanged/);
    expect(refused(apply({ op: "addRule", at: { doc: "scene", scene: "door" }, on: "found" }, content, scene))).toMatch(/node's own event/);
    // A scene's rule names its own scene's targets by address
    expect(refused(apply({ op: "addAction", home: { doc: "scene", scene: "door", rule: 0, part: "do" }, action: { action: "hide", node: "target:key" } }, content, scene))).toMatch(/another scene/);
    expect(refused(apply({ op: "addAction", home: { doc: "scene", scene: "door", rule: 0, part: "do" }, action: { action: "hide", node: "hint" } }, content, scene))).toMatch(/by address/);
    const hide = ok(apply({ op: "addAction", home: { doc: "scene", scene: "door", rule: 0, part: "do" }, action: { action: "hide", node: "target:bell" } }, content, scene));
    expect(sceneRules(hide.content)[0].do.at(-1)).toEqual({ action: "hide", node: "target:bell" });
  });

  it("connecting a scene rule's do to a node writes its address; a node's own event is refused at its on", () => {
    const shown = ok(apply({ op: "connect", from: ["rule:scene:door#0", "do"], to: ["node:door/", "in"] }, content, scene));
    expect(sceneRules(shown.content)[0].do.at(-1)).toEqual({ action: "show", node: "target:door" });
    expect(refused(apply({ op: "connect", from: ["event:door/:found", "out"], to: ["rule:scene:door#0", "on"] }, content, scene))).toMatch(/listens to the bus/);
  });

  it("goto: disconnecting its stub removes it; a derived goto is refused where it is not written", () => {
    const view = project(content, scene);
    const stub = view.stubs.find(s => s.label === "→ Epilogue · goto")!;
    const cut = ok(apply({ op: "disconnect", edge: stub.edge.id }, content, scene));
    expect(sceneRules(cut.content)[0].do).toEqual([{ action: "show", node: "target:door/hint" }]);
    expect(cut.words).toMatch(/no longer does: goto scene:epilogue/);
    const top = project(content, experience);
    const derived = top.edges.find(e => e.from[0] === "scene:door" && e.to[0] === "scene:epilogue" && e.signal === "scene")!;
    expect(refused(apply({ op: "disconnect", edge: derived.id }, content, experience))).toMatch(/written in a scene's rules/);
  });
});

describe("the experience's rules (#334 L-T5b)", () => {
  it("are boxes of the experience level, editable there: a goto is a wire into the scene box", () => {
    const view = project(content, experience);
    const box = view.nodes.find(n => n.id === "rule:experience#0")!;
    expect(box).toMatchObject({ label: "experience rule 1", pick: { kind: "experience" }, home: { doc: "experience", rule: 0 } });
    expect(view.edges.find(e => e.from.join() === "rule:experience#0,do:1")).toMatchObject({ to: ["scene:epilogue", "arrives"], signal: "scene", home: { doc: "experience", part: "do", index: 1 } });
    const goto = ok(apply({ op: "connect", from: ["rule:experience#0", "do"], to: ["scene:cover", "arrives"] }, content, experience));
    expect(goto.content.rules![0].do.at(-1)).toEqual({ action: "goto", address: "scene:cover" });
    expect(goto.logic).toEqual([{ doc: "experience", rules: goto.content.rules }]);
    const aimed = ok(apply({ op: "connect", from: ["rule:experience#0", "do:1"], to: ["scene:door", "arrives"] }, content, experience));
    expect(aimed.words).toMatch(/goto scene:epilogue → goto scene:door/);
    const edge = view.edges.find(e => e.from.join() === "rule:experience#0,do:1")!;
    expect(ok(apply({ op: "disconnect", edge: edge.id }, content, experience)).content.rules![0].do).toHaveLength(1);
    expect(ok(apply({ op: "addRule", at: { doc: "experience" }, on: "chapterOver" }, content, experience)).content.rules).toHaveLength(2);
  });

  it("the experience level edits only the experience's rules; the group level nothing", () => {
    expect(refused(apply({ op: "removeRule", home: { doc: "scene", scene: "door", rule: 0, part: "on" } }, content, experience))).toMatch(/only the experience's own rules/);
    expect(refused(apply({ op: "removeRule", home: { doc: "experience", rule: 0, part: "on" } }, content, { level: "group", group: "ch1" }))).toMatch(/read-only/);
  });
});

describe("when wires come from the condition's expression (#334 L-T5b)", () => {
  it("a boolean variable appends its name; any other type a comparison with its default, said in the words", () => {
    const key = ok(apply({ op: "connect", from: ["var:rung", "get"], to: ["rule:scene:door#0", "when"] }, content, scene));
    expect(sceneRules(key.content)[0].when).toBe("hasKey && rung");
    // mood is not read at the scene level yet: it is offered by the menu, as a typed term
    const choices = addChoices({ content, context: scene, place: null, rule: { doc: "scene", scene: "door", rule: 0 } }, { kind: "variable" });
    const mood = choices.find(c => c.label.startsWith("when mood"))!;
    expect(mood.label).toBe('when mood == "calm"');
    const typed = ok(apply(mood.op!, content, scene));
    expect(sceneRules(typed.content)[0].when).toBe('hasKey && mood == "calm"');
    // Its wire, once drawn, disconnects back to the rest of the chain
    const view = project(typed.content, scene);
    const wire = view.edges.find(e => e.from[0] === "var:mood" && e.to[0] === "rule:scene:door#0")!;
    const back = ok(apply({ op: "disconnect", edge: wire.id }, typed.content, scene));
    expect(sceneRules(back.content)[0].when).toBe("hasKey");
    expect(back.words).toMatch(/no longer reads mood – it runs when hasKey/);
  });

  it("a variable inside a larger term is refused – the Inspector edits it", () => {
    const deep: LogicContent = { ...content, scenes: content.scenes.map(s => (s.id !== "door" ? s : { ...s, rules: [{ on: "doorOpened", when: "(hasKey || rung) && visits > 1", do: [] }] })) };
    const view = project(deep, scene);
    const wire = view.edges.find(e => e.from[0] === "var:hasKey" && e.to[0] === "rule:scene:door#0")!;
    expect(refused(apply({ op: "disconnect", edge: wire.id }, deep, scene))).toMatch(/edit the condition in the Inspector/);
    const visits = view.edges.find(e => e.from[0] === "var:visits" && e.to[0] === "rule:scene:door#0")!;
    expect(sceneRules(ok(apply({ op: "disconnect", edge: visits.id }, deep, scene)).content)[0].when).toBe("(hasKey || rung)");
  });

  it("a set's wire shows its expression", () => {
    const counting: LogicContent = { ...content, rules: [{ on: "targetFound", when: null, do: [{ action: "set", name: "visits", value: "visits + 1" }] }] };
    expect(project(counting, experience).edges.find(e => e.from[0] === "rule:experience#0")?.label).toBe("set = visits + 1");
  });
});

describe("typed variables (B7) in the Logic view", () => {
  it("lists the rules' type problems with their place, and refuses an ill-typed value when it is written", () => {
    const wrong: LogicContent = { ...content, scenes: content.scenes.map(s => (s.id !== "door" ? s : { ...s, rules: [{ on: "doorOpened", when: "mood", do: [{ action: "set", name: "visits", value: '"many"' }] }] })) };
    const problems = project(wrong, scene).problems.map(p => p.message);
    expect(problems).toContain("Door · scene rules, rule 1, when: a condition is true / false – \"mood\" is a text");
    expect(problems.some(p => /^Door · scene rules, rule 1, action 1 \(set visits\): visits is an integer \(declared\)/.test(p))).toBe(true);
    expect(project(wrong, experience).problems.map(p => p.message)).toEqual(expect.arrayContaining(problems));
    expect(typeProblemsByRule(wrong.scenes[1].rules!, logicTypes(wrong)).map(p => p.rule)).toEqual([0, 0]);
    expect(refused(apply({ op: "addAction", home: { doc: "scene", scene: "door", rule: 0, part: "do" }, action: { action: "set", name: "visits", value: "true" } }, content, scene)))
      .toMatch(/visits is a whole number – this is true \/ false/);
  });

  it("a set added by a wire takes the variable's declared default (no scope: the declared one applies)", () => {
    const set = ok(apply({ op: "connect", from: ["rule:experience#0", "do"], to: ["var:visits", "set"] }, content, experience));
    expect(set.content.rules![0].do.at(-1)).toEqual({ action: "set", name: "visits", value: "0" });
  });
});
