import { describe, expect, it } from "vitest";
import { behaviourRules, type EntityData } from "@engine/types";
import { apply, type OpResult } from "../apply";
import { addChoices, fitsHere, palette } from "../palette";
import { project, type LogicContent } from "../project";
import type { Context, Home, Op } from "../types";
import { content } from "./fixture";

const scene: Context = { level: "scene", scene: "door" };
const entity: Context = { level: "entity", scene: "door", target: "door", path: [] };

const ok = (result: OpResult) => {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
};
const refused = (result: OpResult) => {
  if (result.ok) throw new Error(`applied: ${result.words}`);
  return result.reason;
};
const tree = (c: LogicContent, target: string) => c.scenes.flatMap(s => s.targets).find(t => t.id === target)!.entity!;
const rules = (node: EntityData, component = 1) => behaviourRules(node.components![component]);
const doorRules = (c: LogicContent) => rules(tree(c, "door"));
const rule = (r: number, part: "on" | "when" | "do", index?: number): Home =>
  ({ doc: "entity", target: "door", path: [], component: 1, rule: r, part, ...(index === undefined ? {} : { index }) });

describe("apply: connect follows the grammar (#334 L-T4)", () => {
  it("an event into a rule's on writes the event's name into on – the bus stays by name", () => {
    const result = ok(apply({ op: "connect", from: ["event:bellRang", "out"], to: ["rule:door/#0", "on"] }, content, scene));
    expect(doorRules(result.content)[0].on).toBe("bellRang");
    expect(result.words).toMatch(/rule 1 now hears bellRang \(was found\) – by name/);
    expect(result.changed.map(c => c.target)).toEqual(["door"]);
    // Round trip: the new documents project the wire with its home
    const view = project(result.content, scene);
    expect(view.edges.find(e => e.from[0] === "event:bellRang" && e.to[0] === "rule:door/#0")?.home).toMatchObject({ part: "on", rule: 0 });
  });

  it("a node's own event reaches only its own node's rules", () => {
    const view = project(content, scene);
    const own = view.nodes.find(n => n.id === "event:door/:found")!;
    expect(refused(apply({ op: "connect", from: [own.id, "out"], to: ["rule:bell/#0", "on"] }, content, scene))).toMatch(/own event/);
    expect(refused(apply({ op: "connect", from: [own.id, "out"], to: ["rule:door/#0", "on"] }, content, scene))).toMatch(/hears found already/);
  });

  it("a variable into when adds a test; one already tested is refused", () => {
    const result = ok(apply({ op: "connect", from: ["var:hasKey", "get"], to: ["rule:door/#0", "when"] }, content, scene));
    expect(doorRules(result.content)[0].when).toEqual({ match: "all", tests: [{ name: "hasKey", value: true, not: false }] });
    expect(result.words).toMatch(/now runs only when hasKey = true/);
    expect(refused(apply({ op: "connect", from: ["var:hasKey", "get"], to: ["rule:door/#1", "when"] }, content, scene))).toMatch(/tests hasKey already/);
  });

  it("a rule's do into a node, a variable or an event adds the matching action", () => {
    const shown = ok(apply({ op: "connect", from: ["rule:door/#2", "do"], to: ["node:door/1", "in"] }, content, scene));
    expect(doorRules(shown.content)[2].do).toEqual([{ action: "hide", node: "hint" }, { action: "show", node: "hint" }]);
    const hidden = ok(apply({ op: "connect", from: ["rule:door/#0", "do"], to: ["node:door/1", "in"], verb: "hide" }, content, scene));
    expect(doorRules(hidden.content)[0].do.at(-1)).toEqual({ action: "hide", node: "hint" });
    // A variable set elsewhere keeps its scope, so the new set reaches the same readers
    const set = ok(apply({ op: "connect", from: ["rule:door/#0", "do"], to: ["var:hasKey", "set"] }, content, scene));
    expect(doorRules(set.content)[0].do.at(-1)).toEqual({ action: "set", name: "hasKey", value: true, scope: "experience" });
    const emit = ok(apply({ op: "connect", from: ["rule:door/#0", "do"], to: ["event:openDoor", "in"] }, content, scene));
    expect(doorRules(emit.content)[0].do.at(-1)).toEqual({ action: "emit", event: "openDoor" });
    expect(emit.words).toMatch(/now also does: emit openDoor/);
  });

  it("from an action's own outlet it re-aims that action, and refuses another kind", () => {
    const view = project(content, scene);
    expect(view.nodes.find(n => n.id === "rule:bell/#0")?.ports.map(p => p.id)).toEqual(["on", "when", "do:0", "do:1", "do"]);
    const result = ok(apply({ op: "connect", from: ["rule:bell/#0", "do:1"], to: ["event:openDoor", "in"] }, content, scene));
    expect(rules(tree(result.content, "bell"), 0)[0].do[1]).toEqual({ action: "emit", event: "openDoor" });
    expect(result.words).toMatch(/emit bellRang → emit openDoor/);
    expect(refused(apply({ op: "connect", from: ["rule:bell/#0", "do:0"], to: ["event:openDoor", "in"] }, content, scene))).toMatch(/is set – it does not emit/);
  });

  it("refuses what the grammar does not allow, with a reason", () => {
    const at = (from: [string, string], to: [string, string], context: Context = scene) => refused(apply({ op: "connect", from, to }, content, context));
    expect(at(["var:hasKey", "get"], ["rule:door/#0", "on"])).toMatch(/on hears an event – not a variable/);
    expect(at(["event:bellRang", "out"], ["rule:door/#0", "when"])).toMatch(/when tests a variable – not an event/);
    expect(at(["rule:bell/#0", "do"], ["node:door/1", "in"])).toMatch(/not under/);
    expect(at(["event:openDoor", "out"], ["plugin:narrative", "hears"])).toMatch(/Code tab/);
    expect(at(["var:hasKey", "get"], ["event:openDoor", "in"])).toMatch(/no such connection/);
    expect(at(["far:target:cover/key", "sets"], ["var:hasKey", "set"])).toMatch(/elsewhere/);
    expect(at(["event:bellRang", "out"], ["rule:door/#0", "on"], { level: "experience" })).toMatch(/read-only/);
  });
});

describe("apply: disconnect (#334 L-T4)", () => {
  it("a condition's or an action's wire removes it; a cut on leaves the rule hearing nothing, with a problem", () => {
    const view = project(content, scene);
    const when = view.edges.find(e => e.home?.part === "when" && e.to[0] === "rule:door/#1")!;
    const result = ok(apply({ op: "disconnect", edge: when.id }, content, scene));
    expect(doorRules(result.content)[1].when).toBeNull();
    expect(result.words).toMatch(/no longer tests hasKey – it runs always/);
    const emit = view.edges.find(e => e.from.join() === "rule:door/#1,do:1")!;
    expect(doorRules(ok(apply({ op: "disconnect", edge: emit.id }, content, scene)).content)[1].do).toEqual([{ action: "hide", node: "hint" }]);
    const on = view.edges.find(e => e.home?.part === "on" && e.to[0] === "rule:door/#2")!;
    const cut = ok(apply({ op: "disconnect", edge: on.id }, content, scene));
    expect(doorRules(cut.content)[2].on).toBe("");
    expect(cut.words).toMatch(/hears nothing until you wire an event to its on/);
    expect(cut.problems.some(p => /rule 3 hears nothing – wire an event to its on/.test(p.message))).toBe(true);
    const after = project(cut.content, scene);
    expect(after.edges.some(e => e.to[0] === "rule:door/#2" && e.to[1] === "on")).toBe(false);
    expect(after.nodes.find(n => n.id === "rule:door/#2")?.problem).toMatch(/hears nothing/);
    // Wiring an event to it again
    const event = after.nodes.find(n => n.kind === "event" && n.label === "found")!;
    const again = apply({ op: "connect", from: [event.id, "out"], to: ["rule:door/#2", "on"] }, cut.content, scene);
    expect(ok(again).words).toMatch(/now hears found(?! \(was)/);
  });

  it("a wire that joins by name removes the name from the listening side here, and says so", () => {
    const view = project(content, scene);
    const hasKey = view.stubs.find(s => s.label.startsWith("hasKey"))!;
    expect(hasKey.edge.home).toBeNull();
    const result = ok(apply({ op: "disconnect", edge: hasKey.edge.id }, content, scene));
    expect(doorRules(result.content)[1].when).toBeNull();
    expect(result.words).toMatch(/no longer tests hasKey\. The wire joined by name: hasKey is still set in Cover/);
    // The other scene's document is untouched
    expect(result.changed.map(c => c.target)).toEqual(["door"]);
    const openDoor = view.stubs.find(s => s.label.startsWith("openDoor"))!;
    expect(refused(apply({ op: "disconnect", edge: openDoor.edge.id }, content, scene))).toMatch(/heard in Epilogue – the listening side is there/);
    const keyRattled = view.stubs.find(s => s.label.startsWith("keyRattled"))!;
    const unheard = ok(apply({ op: "disconnect", edge: keyRattled.edge.id }, content, scene));
    expect(unheard.words).toMatch(/no longer hears keyRattled – it hears nothing until you wire an event to its on\. The wire joined by name/);
    expect(unheard.changed.map(c => c.target)).toEqual(["bell"]);
    const plugin = view.edges.find(e => e.from[0] === "plugin:narrative")!;
    expect(refused(apply({ op: "disconnect", edge: plugin.id }, content, scene))).toMatch(/Code tab/);
  });
});

describe("apply: rules, conditions and actions by their home (#334 L-T4)", () => {
  it("adds a rule to a node – a behaviour component when it has none – and removes one", () => {
    const added = ok(apply({ op: "addRule", at: { doc: "entity", target: "door", path: [1] }, on: "tap" }, content, entity));
    const hint = tree(added.content, "door").children![1];
    expect(hint.components).toEqual([{ type: "behaviour", rules: [{ on: "tap", do: [] }] }]);
    expect(added.words).toMatch(/^Added hint · rule 4: on tap/);
    expect(project(added.content, entity).nodes.some(n => n.id === "rule:door/1#3")).toBe(true);
    const appended = ok(apply({ op: "addRule", at: { doc: "entity", target: "door", path: [] } }, content, entity));
    expect(doorRules(appended.content)).toHaveLength(4);
    const removed = ok(apply({ op: "removeRule", home: rule(0, "on") }, content, entity));
    expect(doorRules(removed.content).map(r => r.on)).toEqual(["found", "bellRang"]);
    expect(removed.words).toMatch(/Removed .* rule 1 \(on found, show hint\)/);
    expect(refused(apply({ op: "addRule", at: { doc: "entity", target: "door", path: [] }, on: "no way" }, content, entity))).toMatch(/is no event/);
  });

  it("sets a condition, adds and removes an action – and checks them against the grammar", () => {
    const when = ok(apply({ op: "setCondition", home: rule(0, "when"), tests: [{ name: "rung", value: 2, not: true }] }, content, scene));
    expect(doorRules(when.content)[0].when).toEqual({ match: "all", tests: [{ name: "rung", value: 2, not: true }] });
    expect(when.words).toMatch(/only when rung ≠ 2/);
    expect(refused(apply({ op: "setCondition", home: rule(0, "when"), tests: [{ name: "a b", value: 1, not: false }] }, content, scene))).toMatch(/no variable name/);
    const added = ok(apply({ op: "addAction", home: rule(0, "do"), action: { action: "hide", node: "door" } }, content, scene));
    expect(doorRules(added.content)[0].do).toEqual([{ action: "show", node: "hint" }, { action: "hide", node: "door" }]);
    expect(refused(apply({ op: "addAction", home: rule(0, "do"), action: { action: "show", node: "lamp" } }, content, scene))).toMatch(/No node named lamp/);
    expect(refused(apply({ op: "addAction", home: rule(0, "do"), action: { action: "emit", event: "targetFound" } }, content, scene))).toMatch(/engine's own event/);
    const removed = ok(apply({ op: "removeAction", home: rule(1, "do", 0) }, content, scene));
    expect(doorRules(removed.content)[1].do).toEqual([{ action: "emit", event: "openDoor" }]);
  });

  it("refuses scene and experience homes, another scene's targets and canvas edits", () => {
    expect(refused(apply({ op: "removeRule", home: { doc: "scene", scene: "door", rule: 0, part: "on" } }, content, scene))).toMatch(/not in the content yet/);
    expect(refused(apply({ op: "removeRule", home: { doc: "entity", target: "key", path: [], component: 0, rule: 0, part: "on" } }, content, scene))).toMatch(/another scene/);
    expect(refused(apply({ op: "canvas", edit: { edit: "run", id: "x" } }, content, scene))).toMatch(/not here yet/);
  });

  it("runs problems after each op and leaves the input untouched", () => {
    const before = JSON.stringify(content);
    const result = ok(apply({ op: "addAction", home: rule(0, "do"), action: { action: "emit", event: "nobodyHears" } }, content, scene));
    expect(result.problems.some(p => p.message === "nobodyHears is emitted, but nothing in the experience hears it")).toBe(true);
    expect(JSON.stringify(content)).toBe(before);
  });

  it("round trip: project → op → project → op", () => {
    let docs = content;
    const ops: Op[] = [
      { op: "addRule", at: { doc: "entity", target: "bell", path: [] }, on: "openDoor" },
      { op: "connect", from: ["rule:bell/#1", "do"], to: ["var:rung", "set"] },
    ];
    for (const op of ops) docs = ok(apply(op, docs, scene)).content;
    const view = project(docs, scene);
    expect(view.edges.find(e => e.from[0] === "rule:bell/#1" && e.to[0] === "var:rung")).toMatchObject({ label: "set = true", home: { part: "do", index: 0 } });
    expect(view.edges.find(e => e.from[0] === "event:openDoor" && e.to[0] === "rule:bell/#1")).toBeTruthy();
  });
});

describe("which node types fit here (#334 L-T4)", () => {
  it("lists the registry's types, the addable ones first, with why the others are not added by hand", () => {
    const entries = palette();
    expect(entries.filter(e => e.addable).map(e => e.kind)).toEqual(["event", "rule", "variable", "play", "pause", "stop", "show", "hide", "set", "emit"]);
    expect(entries.find(e => e.kind === "node")).toMatchObject({ addable: false, detail: expect.stringMatching(/tree/) });
    expect(entries.find(e => e.kind === "goto")?.addable).toBe(false);
  });

  it("a rule needs a node, an action or a condition needs a rule, the upper levels none", () => {
    const place = { doc: "entity" as const, target: "door", path: [] };
    const ruleRef = { target: "door", path: [], component: 1, rule: 0 };
    expect(fitsHere("rule", { context: scene, place: null, rule: null })).toMatch(/Select a node/);
    expect(fitsHere("rule", { context: scene, place, rule: null })).toBeNull();
    expect(fitsHere("show", { context: scene, place, rule: null })).toMatch(/Select a rule/);
    expect(fitsHere("show", { context: scene, place, rule: ruleRef })).toBeNull();
    expect(fitsHere("show", { context: { level: "group", group: "ch1" }, place, rule: ruleRef })).toMatch(/read-only/);
    expect(fitsHere("plugin", { context: scene, place, rule: ruleRef })).toMatch(/Code tab/);
  });

  it("turns the types that fit into ops, filtered by what is typed, new names included", () => {
    const a = { content, context: entity, place: { doc: "entity" as const, target: "door", path: [] }, rule: { target: "door", path: [], component: 1, rule: 0 } };
    const shows = addChoices(a, { query: "show" });
    expect(shows.map(c => c.label)).toEqual(["show its own node", "show door", "show hint"]);
    expect(shows[2].op).toEqual({ op: "addAction", home: { doc: "entity", target: "door", path: [], component: 1, rule: 0, part: "do" }, action: { action: "show", node: "hint" } });
    expect(addChoices(a, { query: "rule on bellR" }).map(c => c.label)).toEqual(["rule on bellR", "rule on bellRang"]);
    expect(addChoices(a, { query: "rule on bellRang" }).map(c => c.label)).toEqual(["rule on bellRang"]);
    expect(addChoices(a, { query: "emit fooBar" })[0]).toMatchObject({ label: "emit fooBar", detail: "a new event" });
    expect(addChoices(a, { kind: "variable" }).map(c => c.label)).toContain("when hasKey = true");
    // Without a rule: one line says why the actions are not offered
    const none = addChoices({ ...a, rule: null });
    expect(none.filter(c => c.disabled).map(c => c.label)).toEqual(["variable, play, pause, stop, show, hide, set, emit"]);
    // Every op it offers applies
    for (const choice of addChoices(a).filter(c => c.op)) expect(apply(choice.op!, content, entity).ok, choice.label).toBe(true);
  });
});
