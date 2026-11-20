import { describe, expect, it } from "vitest";
import type { BehaviourRule, EntityData } from "@engine/types";
import type { VariableType } from "@shared/types/variables";
import {
  appendCondition, behaviourIssues, experienceEvents, experienceVariables, literalOf, newAction, newRule, pathOfName, placeholderOf, removeConditionTerms,
  rulesOf, setValueProblems, subtreeNames, treeBehaviourIssues, whenProblems, withAction, withRules,
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
    { type: "behaviour", rules: [{ on: "found", do: { show: "hint" } }, { on: "found", when: "hasKey", do: [{ hide: "hint" }, { emit: "openDoor" }] }] },
  ],
};

const TYPES: Record<string, VariableType> = { hasKey: "boolean", tries: "integer", mood: "string", speed: "number" };
const typeOf = (name: string) => TYPES[name];

describe("the rule editor's logic (#88, #334)", () => {
  it("reads a node's rules and writes them back in the content's shortest form, the other components untouched", () => {
    const rules = rulesOf(door, 1);
    expect(rules).toHaveLength(2);
    expect(rulesOf(door, 0)).toEqual([]);
    const next = withRules(door, 1, [...rules, { on: "tap", when: "tries > 2", do: [{ action: "play", clip: "rattle", node: "leaf" }, { action: "set", name: "tries", value: "tries + 1" }] }]);
    expect(next.components?.[0]).toBe(door.components?.[0]);
    expect(next.components?.[1]).toEqual({
      type: "behaviour",
      rules: [
        { on: "found", do: { show: "hint" } },
        { on: "found", when: "hasKey", do: [{ hide: "hint" }, { emit: "openDoor" }] },
        { on: "tap", when: "tries > 2", do: [{ play: "rattle", node: "leaf" }, { set: { tries: "tries + 1" } }] },
      ],
    });
  });

  it("adds, changes and removes actions; a new rule hears found on a node, sceneChanged on a scene or the experience", () => {
    let rule: BehaviourRule = newRule();
    expect(rule).toEqual({ on: "found", when: null, do: [] });
    expect(newRule("scene").on).toBe("sceneChanged");
    rule = withAction(rule, 0, newAction("play"));
    rule = withAction(rule, 1, newAction("set", undefined, ["tries"], typeOf));
    expect(rule.do).toEqual([{ action: "play", clip: "", node: "" }, { action: "set", name: "tries", value: "0" }]);
    rule = withAction(rule, 0, undefined);
    expect(rule.do).toEqual([{ action: "set", name: "tries", value: "0" }]);
    expect(newAction("goto")).toEqual({ action: "goto", address: "" });
  });

  it("a verb changed keeps what both verbs take: the node, a set's variable, a goto's scene", () => {
    expect(newAction("hide", { action: "play", clip: "rattle", node: "leaf" })).toEqual({ action: "hide", node: "leaf" });
    expect(newAction("play", { action: "show", node: "hint" })).toEqual({ action: "play", clip: "", node: "hint" });
    expect(newAction("set", { action: "set", name: "mood", value: '"calm"', scope: "stage" }, [], typeOf)).toEqual({ action: "set", name: "mood", value: '""' });
    expect(newAction("emit", { action: "show", node: "hint" })).toEqual({ action: "emit", event: "" });
    expect(newAction("goto", { action: "goto", address: "scene:cover" })).toEqual({ action: "goto", address: "scene:cover" });
  });

  it("typed placeholders and literals: 0 for numbers, true, an empty text – a declared default first", () => {
    expect(placeholderOf("integer")).toBe("0");
    expect(placeholderOf("string")).toBe('""');
    expect(placeholderOf(undefined)).toBe("true");
    expect(literalOf({ type: "string", default: "calm" })).toBe('"calm"');
    expect(literalOf({ type: "integer" })).toBe("0");
  });
});

describe("expressions are checked before they are saved (B8)", () => {
  it("a condition must parse, be well-typed and be true / false; empty is always", () => {
    expect(whenProblems("", typeOf)).toEqual([]);
    expect(whenProblems("hasKey && tries > 2", typeOf)).toEqual([]);
    expect(whenProblems("hasKey &&", typeOf)).toEqual(["a value is missing"]);
    expect(whenProblems("tries = 2", typeOf)).toEqual(["= is no comparison – write =="]);
    expect(whenProblems("tries + 1", typeOf)).toEqual(["a condition is true / false – this is a whole number"]);
    expect(whenProblems("mood > 2", typeOf)[0]).toMatch(/compares numbers, not a text/);
    // A variable nobody types (a plugin's) is let through
    expect(whenProblems("doorOpen", typeOf)).toEqual([]);
  });

  it("a set's value must fit the variable's type; empty deletes", () => {
    expect(setValueProblems("", "tries", typeOf)).toEqual([]);
    expect(setValueProblems("tries + 1", "tries", typeOf)).toEqual([]);
    expect(setValueProblems("tries + 1", "speed", typeOf)).toEqual([]);
    expect(setValueProblems("2.5", "tries", typeOf)).toEqual(["tries is a whole number – this is a number"]);
    expect(setValueProblems("calm", "mood", typeOf)).toEqual([]); // a variable named calm: untyped
    expect(setValueProblems('"calm', "mood", typeOf)[0]).toMatch(/not closed .*in quotes/);
    expect(setValueProblems("true", "mood", typeOf)).toEqual(["mood is a text – this is true / false"]);
  });

  it("a wired variable is appended with &&; an || chain keeps its meaning", () => {
    expect(appendCondition(null, "hasKey")).toBe("hasKey");
    expect(appendCondition("hasKey", "tries == 0")).toBe("hasKey && tries == 0");
    expect(appendCondition("a || b", "c")).toBe("(a || b) && c");
  });

  it("a cut wire takes the variable's terms out of a top-level chain – anything deeper is refused", () => {
    expect(removeConditionTerms("hasKey", "hasKey")).toEqual({ when: null });
    expect(removeConditionTerms("hasKey && tries > 2", "tries")).toEqual({ when: "hasKey" });
    expect(removeConditionTerms("a || b == 1 || c", "b")).toEqual({ when: "a || c" });
    expect(removeConditionTerms("(a || b) && c", "c")).toEqual({ when: "(a || b)" });
    expect(removeConditionTerms("hasKey && tries > 2", "mood")).toEqual({ when: "hasKey && tries > 2" });
    expect(removeConditionTerms("(a || b) && c", "a")).toEqual({ refused: true });
    expect(removeConditionTerms("tries > speed", "tries")).toEqual({ refused: true });
  });
});

describe("what the pickers offer", () => {
  it("offers the subtree's node names, each once, and finds the node a name stands for (the first)", () => {
    expect(subtreeNames(door)).toEqual(["door", "leaf", "hint"]);
    expect(pathOfName(door, "")).toEqual([]);
    expect(pathOfName(door, "door")).toEqual([]);
    expect(pathOfName(door, "leaf")).toEqual([0]);
    expect(pathOfName(door, "hint")).toEqual([1]);
    expect(pathOfName(door, "nowhere")).toBeNull();
  });

  it("offers the experience's variables and events: its behaviours', its scene and experience rules', the stage's, then the core events", () => {
    const key: EntityData = { type: "model", assets: [], components: [{ type: "behaviour", rules: [{ on: "tap", do: [{ set: { hasKey: true }, scope: "experience" }, { emit: "keyRattled" }] }] }] };
    expect(experienceVariables([key, door], ["doorOpen", "hasKey"])).toEqual(["doorOpen", "hasKey"]);
    const logic: BehaviourRule[] = [{ on: "chapterOver", when: "visits > 1", do: [{ action: "set", name: "done", value: "true" }, { action: "goto", address: "scene:end" }] }];
    expect(experienceVariables([key], [], logic)).toEqual(["done", "hasKey", "visits"]);
    const events = experienceEvents([key, door], ["doorOpened", "behaviour", "goto", "targetFound"], logic);
    expect(events.slice(0, 4)).toEqual(["chapterOver", "doorOpened", "keyRattled", "openDoor"]);
    expect(events).toContain("varChanged");
    expect(events).not.toContain("behaviour");
    expect(events).not.toContain("goto");
  });

  it("names what keeps Save off: an empty name, an event not chosen, a condition that does not parse, anywhere in the tree", () => {
    expect(treeBehaviourIssues(door)).toEqual([]);
    const broken = withRules(door, 1, [{ on: "", when: "hasKey &&", do: [{ action: "emit", event: "" }] }]);
    const issues = behaviourIssues(broken);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toBe("rule 1 – on: expected found, lost, tap, unlocked or an event's name (camelCase), got \"\"");
    expect(issues[1]).toMatch(/^rule 1 – when: a value is missing/);
    expect(issues[2]).toBe("rule 1 – do.emit: expected an event's name (camelCase letters and digits), got \"\"");
    expect(treeBehaviourIssues({ type: "group", assets: [], children: [broken] })).toHaveLength(3);
  });

  it("Save writes the rules as they are, not as rows of parameters", () => {
    expect(contentEntity(door, true).components?.[1]).toEqual(door.components?.[1]);
  });
});
