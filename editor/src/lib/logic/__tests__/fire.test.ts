import { describe, expect, it } from "vitest";
import { describePayload } from "../../stage/event-log";
import { NOT_RUNNING, parsePayload, parseValue, ruleOf, scopeOf, stageItems, type StageWhere } from "../fire";
import { parseDetail } from "../live";
import { logicTypes, project, type LogicContent } from "../project";
import type { Context } from "../types";
import { content } from "./fixture";

/** Testing on the stage from the Logic canvas (#334, Tilman 2026-11-21): which box offers what, and the fields' parsers */

const withRules: LogicContent = {
  ...content,
  rules: [{ on: "doorOpened", when: null, do: [{ action: "set", name: "opened", value: "true" }] }],
  scenes: content.scenes.map(s => (s.id === "door" ? { ...s, rules: [{ on: "sceneChanged", when: null, do: [{ action: "emit", event: "arrived" }] }] } : s)),
};

const where = (context: Context, extra: Partial<StageWhere> = {}): StageWhere => ({
  running: true, scene: "door", context, types: logicTypes(withRules), vars: [], ...extra,
});
const items = (context: Context, box: string, extra: Partial<StageWhere> = {}, docs: LogicContent = withRules) => {
  const node = project(docs, context).nodes.find(n => n.id === box);
  if (!node) throw new Error(`no box ${box} at ${JSON.stringify(context)}`);
  return stageItems(node, docs, where(context, extra));
};
const DOOR: Context = { level: "scene", scene: "door" };

describe("an event box fires its event on the stage's bus", () => {
  it("offers Fire and Fire with a payload on the open scene, both disabled while the stage does not run", () => {
    const [fire, withPayload] = items(DOOR, "event:openDoor");
    expect(fire).toMatchObject({ label: "Fire on stage", disabled: null, action: { kind: "fire", event: "openDoor", ask: false } });
    expect(withPayload).toMatchObject({ label: "Fire with a payload…", disabled: null, action: { kind: "fire", event: "openDoor", ask: true } });
    expect(items(DOOR, "event:openDoor", { running: false }).map(i => i.disabled)).toEqual([NOT_RUNNING, NOT_RUNNING]);
  });

  it("says honestly what hears it from another scene's level: the bus is the stage's, that scene's rules are not on it", () => {
    const [fire] = items({ level: "scene", scene: "epilogue" }, "event:openDoor");
    expect(fire.disabled).toBeNull();
    expect(fire.detail).toContain("Epilogue's own rules are not on the stage");
    expect(items({ level: "experience" }, "event:sceneChanged")[0].disabled).toContain("core event");
  });

  it("a node's own tap box taps its target; found, lost and unlocked are the stage's hooks", () => {
    expect(items({ level: "scene", scene: "cover" }, "event:key/:tap", { scene: "cover" })).toMatchObject([{ label: "Tap on stage", disabled: null, action: { kind: "tap", target: "key" } }]);
    expect(items({ level: "scene", scene: "cover" }, "event:key/:tap")[0].disabled).toContain("not on the stage");
    expect(items(DOOR, "event:door/:found")[0].disabled).toContain("Run this rule instead");
  });
});

describe("a variable box sets it on the stage", () => {
  it("by its type and the scope its rules write it in; the stage's own scope first", () => {
    expect(items(DOOR, "var:hasKey")).toMatchObject([{ label: "Set on stage…", disabled: null, action: { kind: "set", name: "hasKey", type: "boolean", scope: "experience" } }]);
    const live = items(DOOR, "var:hasKey", { vars: [{ scope: "session", name: "hasKey", value: true }] })[0];
    expect(live.action).toMatchObject({ scope: "session" });
    expect(live.detail).toContain("now true");
    expect(scopeOf(withRules, "nobodySetsIt")).toBe("scene");
    expect(scopeOf({ ...withRules, variables: { opened: { type: "boolean", scope: "stage" } } }, "opened")).toBe("stage");
  });
});

describe("a rule box runs its rule as if its event came", () => {
  it("a node's rule: its target and node name, its index – its when applies", () => {
    const [run] = items(DOOR, "rule:door/#1");
    expect(run).toMatchObject({ label: "Run this rule", disabled: null, action: { kind: "run", home: { targetId: "door", node: "" }, rule: 1, on: "found" } });
    expect(run.detail).toBe("as if found came – its when (hasKey) applies; only this rule");
    expect(items(DOOR, "rule:door/#0")[0].detail).toContain("no when, it always runs");
    expect(items(DOOR, "rule:door/#1", { scene: "cover" })[0].disabled).toContain("not on the stage");
  });

  it("a scene's rule only while its scene is on the stage; the experience's always", () => {
    const scene = items(DOOR, "rule:scene:door#0")[0];
    expect(scene.action).toEqual({ kind: "run", home: { home: "scene", scene: "door" }, rule: 0, on: "sceneChanged" });
    expect(items(DOOR, "rule:scene:door#0", { scene: "cover" })[0].disabled).toBe("Door is not on the stage – open it to run its rules.");
    expect(items({ level: "experience" }, "rule:experience#0", { scene: "cover" })).toMatchObject([{ disabled: null, action: { home: { home: "experience" }, rule: 0 } }]);
  });

  it("refuses a node the stage cannot tell apart: two nodes of one name with rules", () => {
    const twin = { type: "model", assets: [], components: [{ type: "behaviour", rules: [{ on: "tap", do: { hide: "" } }] }] };
    const docs: LogicContent = { ...withRules, scenes: withRules.scenes.map(s => (s.id === "door" ? { ...s, targets: [{ id: "bell", entity: { type: "group", assets: [], children: [twin, twin] } }] } : s)) };
    const [run] = items({ level: "scene", scene: "door" }, "rule:bell/0#0", {}, docs as LogicContent);
    expect(run.disabled).toContain("cannot tell them apart");
  });

  it("finds the rule in the draft", () => {
    expect(ruleOf(withRules, { doc: "experience", rule: 0 })?.on).toBe("doorOpened");
    expect(ruleOf(withRules, { doc: "entity", target: "bell", path: [], component: 0, rule: 0 })?.on).toBe("keyRattled");
    expect(ruleOf(withRules, { doc: "entity", target: "bell", path: [], component: 3, rule: 0 })).toBeUndefined();
  });
});

describe("the fields", () => {
  it("reads a payload as key: value pairs – JSON where it reads as JSON, else the text", () => {
    expect(parsePayload("")).toEqual({ ok: true, value: undefined });
    expect(parsePayload("door: front, tries: 2, open: true, note: \"a, b\"")).toEqual({ ok: true, value: { door: "front", tries: 2, open: true, note: "a, b" } });
    expect(parsePayload("list: [1, 2]\nname = 'x y'")).toEqual({ ok: true, value: { list: [1, 2], name: "x y" } });
    expect(parsePayload("just text")).toMatchObject({ ok: false });
    expect(parsePayload("door:")).toEqual({ ok: false, reason: "door has no value – write door: value" });
  });

  it("reads back the Log's own line", () => {
    const payload = { targetId: "door", n: 3, said: "a · b" };
    expect(parsePayload(describePayload(payload))).toEqual({ ok: true, value: payload });
    // The Log's mark is no field: Trace reads the line as before
    expect(parseDetail(`${describePayload({ name: "hasKey" })} · by hand`)).toEqual({ name: "hasKey" });
  });

  it("reads a variable's value by its type", () => {
    expect(parseValue("boolean", "true")).toEqual({ ok: true, value: true });
    expect(parseValue("boolean", "yes")).toMatchObject({ ok: false });
    expect(parseValue("integer", "3")).toEqual({ ok: true, value: 3 });
    expect(parseValue("integer", "3.5")).toMatchObject({ ok: false });
    expect(parseValue("number", "-0.5")).toEqual({ ok: true, value: -0.5 });
    expect(parseValue("number", "abc")).toMatchObject({ ok: false });
    expect(parseValue("string", "3")).toEqual({ ok: true, value: "3" });
    expect(parseValue("string", "\"\"")).toEqual({ ok: true, value: "" });
    expect(parseValue("string", "")).toMatchObject({ ok: false });
    expect(parseValue(null, "false")).toEqual({ ok: true, value: false });
    expect(parseValue(null, "12")).toEqual({ ok: true, value: 12 });
    expect(parseValue(null, "calm")).toEqual({ ok: true, value: "calm" });
  });
});
