import { describe, expect, it } from "vitest";
import type { BehaviourRule, EntityData } from "@engine/types";
import {
  behaviourIssues, bookEvents, bookVariables, formatValue, newAction, newRule, newTest, parseValue, pathOfName, rulesOf, subtreeNames,
  treeBehaviourIssues, withAction, withRules, withTest,
} from "../behaviour-edit";
import { contentEntity } from "../values";

const door: EntityData = {
  type: "group", assets: [], name: "door",
  children: [
    { type: "model", name: "leaf", assets: [{ id: "d", assetType: "glb", src: "/door.glb" }] },
    { type: "text", name: "hint", assets: [], text: "Find the key", children: [{ type: "text", name: "leaf", assets: [], text: "twin" }] },
  ],
  components: [
    { type: "door", lift: 0.35 },
    { type: "behaviour", rules: [{ on: "found", do: { show: "hint" } }, { on: "found", when: { hasKey: true }, do: [{ hide: "hint" }, { emit: "openDoor" }] }] },
  ],
};

describe("the rule editor's logic (#88)", () => {
  it("reads a node's rules and writes them back in the content's shortest form, the other components untouched", () => {
    const rules = rulesOf(door, 1);
    expect(rules).toHaveLength(2);
    expect(rulesOf(door, 0)).toEqual([]);
    const next = withRules(door, 1, [...rules, { on: "tap", when: null, do: [{ action: "play", clip: "rattle", node: "leaf" }] }]);
    expect(next.components?.[0]).toBe(door.components?.[0]);
    expect(next.components?.[1]).toEqual({
      type: "behaviour",
      rules: [
        { on: "found", do: { show: "hint" } },
        { on: "found", when: { hasKey: true }, do: [{ hide: "hint" }, { emit: "openDoor" }] },
        { on: "tap", do: { play: "rattle", node: "leaf" } },
      ],
    });
  });

  it("adds, changes and removes conditions and actions; an empty condition is none", () => {
    let rule: BehaviourRule = newRule();
    expect(rule).toEqual({ on: "found", when: null, do: [] });
    rule = withTest(rule, 0, newTest(["hasKey"]));
    expect(rule.when).toEqual({ match: "all", tests: [{ name: "hasKey", value: true, not: false }] });
    rule = withTest(rule, 1, newTest());
    rule = withTest(rule, 1, { name: "tries", value: 3, not: true });
    expect(rule.when?.tests[1]).toEqual({ name: "tries", value: 3, not: true });
    rule = withTest(withTest(rule, 0, undefined), 0, undefined);
    expect(rule.when).toBeNull();
    rule = withAction(rule, 0, newAction("play"));
    rule = withAction(rule, 1, newAction("set", undefined, ["hasKey"]));
    expect(rule.do).toEqual([{ action: "play", clip: "", node: "" }, { action: "set", name: "hasKey", value: true, scope: "spread" }]);
    rule = withAction(rule, 0, undefined);
    expect(rule.do).toEqual([{ action: "set", name: "hasKey", value: true, scope: "spread" }]);
  });

  it("a verb changed keeps what both verbs take: the node, a set's variable", () => {
    expect(newAction("hide", { action: "play", clip: "rattle", node: "leaf" })).toEqual({ action: "hide", node: "leaf" });
    expect(newAction("play", { action: "show", node: "hint" })).toEqual({ action: "play", clip: "", node: "hint" });
    expect(newAction("set", { action: "set", name: "doorOpen", value: false, scope: "stage" })).toEqual({ action: "set", name: "doorOpen", value: true, scope: "spread" });
    expect(newAction("emit", { action: "show", node: "hint" })).toEqual({ action: "emit", event: "" });
  });

  it("types a value from its text and shows it again", () => {
    expect(parseValue("true")).toBe(true);
    expect(parseValue(" false ")).toBe(false);
    expect(parseValue("3")).toBe(3);
    expect(parseValue("-0.5")).toBe(-0.5);
    expect(parseValue("")).toBeNull();
    expect(parseValue("open sesame")).toBe("open sesame");
    expect(formatValue(null)).toBe("");
    expect(formatValue(true)).toBe("true");
    expect(formatValue(2)).toBe("2");
  });

  it("offers the subtree's node names, each once, and finds the node a name stands for (the first)", () => {
    expect(subtreeNames(door)).toEqual(["door", "leaf", "hint"]);
    expect(pathOfName(door, "")).toEqual([]);
    expect(pathOfName(door, "door")).toEqual([]);
    expect(pathOfName(door, "leaf")).toEqual([0]);
    expect(pathOfName(door, "hint")).toEqual([1]);
    expect(pathOfName(door, "nowhere")).toBeNull();
  });

  it("offers the book's variables and events: its behaviours', the stage's, then the core events", () => {
    const key: EntityData = { type: "model", assets: [], components: [{ type: "behaviour", rules: [{ on: "tap", do: [{ set: { hasKey: true }, scope: "book" }, { emit: "keyRattled" }] }] }] };
    expect(bookVariables([key, door], ["doorOpen", "hasKey"])).toEqual(["doorOpen", "hasKey"]);
    const events = bookEvents([key, door], ["doorOpened", "behaviour", "targetFound"]);
    expect(events.slice(0, 3)).toEqual(["doorOpened", "keyRattled", "openDoor"]);
    expect(events).toContain("varChanged");
    expect(events).not.toContain("behaviour");
  });

  it("names what keeps Save off: an empty name, an event not chosen, anywhere in the tree", () => {
    expect(treeBehaviourIssues(door)).toEqual([]);
    const broken = withRules(door, 1, [{ on: "", when: { match: "all", tests: [{ name: "", value: true, not: false }] }, do: [{ action: "emit", event: "" }] }]);
    expect(behaviourIssues(broken)).toEqual([
      "rule 1 – on: expected an event – found, lost, tap, unlocked or an event's name (camelCase), got \"\"",
      "rule 1 – when.: not a variable name (camelCase letters and digits)",
      "rule 1 – do.emit: expected an event's name (camelCase letters and digits), got \"\"",
    ]);
    expect(treeBehaviourIssues({ type: "group", assets: [], children: [broken] })).toHaveLength(3);
  });

  it("Save writes the rules as they are, not as rows of parameters", () => {
    expect(contentEntity(door, true).components?.[1]).toEqual(door.components?.[1]);
  });
});
