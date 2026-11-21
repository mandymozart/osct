import { describe, expect, it } from "vitest";
import { behaviourData, behaviourEvents, behaviourGotos, behaviourRules, behaviourVariables, describeActions, readRules, rulesProblems } from "@shared/types/behaviour";
import { componentProblems } from "@shared/types/components";
import { canvasProblems, logicData, logicProblems, logicRules, withoutCanvas } from "@shared/types/logic";
import { addressProblem, formatAddress, nodeAddress, parseAddress, sceneAddress } from "@shared/types/address";
import { evaluateExpression, expressionLiteral, expressionVariables, parseExpression } from "@shared/text/expressions";

/** The built-in behaviour component – its grammar, checked by the build and the guard */
describe("behaviour: the content's grammar", () => {
  const key = {
    type: "behaviour",
    rules: [
      { on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "experience" }, { emit: "keyRattled" }] },
      { on: "found", when: "hasKey", do: "play" },
      { on: "found", when: "hasKey || tries != 3", do: { hide: "hint" } },
      { on: "doorOpened", when: "!doorOpen", do: [{ show: "" }, "stop", { pause: "door" }, { play: "", node: "door" }, { set: { tries: null } }] },
      { on: "tap", when: 'mood == "calm" && tries > 2', do: { goto: "scene:cover" } },
    ],
  };

  it("accepts every event, condition and action form, on any node type", () => {
    expect(componentProblems([key], "components", "model")).toEqual([]);
    expect(componentProblems([key], "components", "group")).toEqual([]);
    expect(componentProblems([{ type: "behaviour" }], "components", "text")).toEqual([]);
  });

  it("names every problem with its path", () => {
    expect(componentProblems([{
      type: "behaviour",
      extra: 1,
      rules: [
        { on: "Found Me", do: "dance" },
        { on: "tap" },
        { on: "tap", when: { hasKey: true }, do: { play: 3, node: 4 } },
        { on: "tap", when: "a = 1", do: [{ set: {} }, { set: { x: { y: 1 } }, scope: "world" }, { emit: "targetFound" }, { emit: "tap" }, { show: "a", hide: "b" }, { emit: "x", node: "a" }] },
        "nope",
        { on: "tap", when: "clock(1) || map.total", do: [{ goto: "cover" }, { goto: "target:door" }] },
        { on: "", when: "", do: "show" },
      ],
    }], "components")).toEqual([
      "components[0].extra: unknown field of behaviour (rules)",
      'components[0].rules[0].on: expected found, lost, tap, unlocked or an event\'s name (camelCase), got "Found Me"',
      'components[0].rules[0].do: expected an action – play, pause, stop, show, hide or { play | pause | stop | show | hide | set | emit | goto: … }, got "dance"',
      "components[0].rules[1].do: a rule needs an action or a list of actions",
      'components[0].rules[2].when: a condition is an expression since content schema 5.0 (hasKey && tries > 2) – the object form {"hasKey":true} is gone',
      "components[0].rules[2].do.play: expected a clip's name (empty = the node's own clip), got 3",
      "components[0].rules[2].do.node: expected a node's name (empty = the behaviour's own node), got 4",
      'components[0].rules[3].when: = is no comparison – write == – "a = 1" at 3',
      "components[0].rules[3].do[0].set: expected { variable: value, … }",
      'components[0].rules[3].do[1].set.x: expected an expression, a number, true / false or null (deletes), got {"y":1}',
      'components[0].rules[3].do[1].scope: expected one of scene, stage, session, experience, got "world"',
      "components[0].rules[3].do[2].emit: targetFound is the engine's own event – a rule hears it, never emits it",
      "components[0].rules[3].do[3].emit: tap is the engine's own event – a rule hears it, never emits it",
      "components[0].rules[3].do[4]: an action has one of play, pause, stop, show, hide, set, emit, goto, got show and hide",
      "components[0].rules[3].do[5].node: unknown field of emit",
      "components[0].rules[4]: expected a rule { on, when?, do }",
      'components[0].rules[5].when: clock() – an experience\'s texts and rules have no functions – "clock(1) || map.total" at 1',
      'components[0].rules[5].when: map.total – a variable\'s name has no dot – "clock(1) || map.total" at 13',
      'components[0].rules[5].do[0].goto: "cover" is not an address (scene:<id>)',
      'components[0].rules[5].do[1].goto: "target:door": a target address does not fit here (scene:<id>)',
      'components[0].rules[6].on: expected found, lost, tap, unlocked or an event\'s name (camelCase), got ""',
      'components[0].rules[6].when: the condition is empty – ""',
    ]);
    expect(componentProblems([{ type: "behaviour", rules: {} }], "c")).toEqual(["c[0].rules: expected a list of rules { on, when?, do }"]);
  });

  it("reads the content into rules: shorthands, expressions, goto, a set of several variables", () => {
    const rules = behaviourRules(key);
    expect(rules[0]).toEqual({ on: "tap", when: null, do: [
      { action: "play", clip: "rattle", node: "" },
      { action: "set", name: "hasKey", value: "true", scope: "experience" },
      { action: "emit", event: "keyRattled" },
    ] });
    expect(rules[1]).toEqual({ on: "found", when: "hasKey", do: [{ action: "play", clip: "", node: "" }] });
    expect(rules[2].when).toBe("hasKey || tries != 3");
    expect(rules[3].do).toEqual([
      { action: "show", node: "" }, { action: "stop", node: "" }, { action: "pause", node: "door" }, { action: "play", clip: "", node: "door" },
      { action: "set", name: "tries", value: null },
    ]);
    expect(rules[4].do).toEqual([{ action: "goto", address: "scene:cover" }]);
    // a set value is an expression (B2): a bare number or true / false reads as its text, a text value is written "…"
    expect(behaviourRules({ rules: [{ on: "tap", do: { set: { a: 1, b: "tries + 1", c: '"x"' } } }] })[0].do)
      .toEqual([{ action: "set", name: "a", value: "1" }, { action: "set", name: "b", value: "tries + 1" }, { action: "set", name: "c", value: '"x"' }]);
    expect(behaviourData(behaviourRules({ rules: [{ on: "tap", do: { set: { a: 1, b: "tries + 1", c: '"x"', d: false } } }] })).rules[0].do)
      .toEqual([{ set: { a: 1 } }, { set: { b: "tries + 1" } }, { set: { c: '"x"' } }, { set: { d: false } }]);
    expect(componentProblems([{ type: "behaviour", rules: [{ on: "tap", do: { set: { a: "calm down" } } }] }], "c"))
      .toEqual(['c[0].rules[0].do.set.a: down does not belong here – "calm down" (a value is an expression; a text is written "…")']);
    // an empty condition is none; the object form is not read
    expect(readRules([{ on: "tap", when: "  ", do: "show" }, { on: "tap", when: { a: 1 }, do: "show" }]).map(rule => rule.when)).toEqual([null, null]);
    expect(behaviourRules(undefined)).toEqual([]);
  });

  it("writes rules back in the shortest form, which reads the same again", () => {
    const data = behaviourData(behaviourRules(key));
    expect(data.rules[1]).toEqual({ on: "found", when: "hasKey", do: "play" });
    expect(data.rules[3]).toEqual({ on: "doorOpened", when: "!doorOpen", do: ["show", "stop", { pause: "door" }, { play: "", node: "door" }, { set: { tries: null } }] });
    expect(data.rules[4]).toEqual({ on: "tap", when: 'mood == "calm" && tries > 2', do: { goto: "scene:cover" } });
    expect(behaviourRules(data)).toEqual(behaviourRules(key));
    expect(componentProblems([data], "components")).toEqual([]);
    expect(behaviourData([{ on: "tap", when: " ", do: [{ action: "emit", event: "x" }] }]).rules[0]).toEqual({ on: "tap", do: { emit: "x" } });
  });

  it("lists the variables, bus events and gotos the rules use, and describes actions for the log", () => {
    const rules = behaviourRules(key);
    expect(behaviourVariables(rules)).toEqual(["doorOpen", "hasKey", "mood", "tries"]);
    expect(behaviourEvents(rules)).toEqual(["doorOpened", "keyRattled"]);
    expect(behaviourGotos(rules)).toEqual(["scene:cover"]);
    expect(describeActions(rules[0].do)).toBe("play rattle · set hasKey = true (experience) · emit keyRattled");
    expect(describeActions(rules[3].do)).toBe("show · stop · pause door · play its clip on door · set tries = unset");
    expect(describeActions(rules[4].do)).toBe("goto scene:cover");
  });
});

describe("logic: a scene's and the experience's rules (schema 5.0)", () => {
  it("hear the bus, name nodes by address, go to scenes", () => {
    const logic = {
      rules: [
        { on: "doorOpened", when: "hasKey", do: [{ show: "target:door/hint" }, { play: "creak", node: "target:door" }, { goto: "scene:epilogue" }] },
        { on: "targetUnlocked", do: { set: { unlocks: 1 }, scope: "experience" } },
        { on: "sceneChanged", do: { emit: "arrived" } },
      ],
      canvas: { groups: [{ id: "g1", label: "Door", members: ["rule:0"] }], notes: [{ id: "n1", text: "hi", x: 1, y: 2 }], folds: ["rule:1"] },
    };
    expect(logicProblems(logic, "scenes[0].logic", "scene")).toEqual([]);
    expect(logicProblems(logic, "experience.logic", "experience")).toEqual([]);
    expect(logicRules(logic)[0].do).toEqual([
      { action: "show", node: "target:door/hint" }, { action: "play", clip: "creak", node: "target:door" }, { action: "goto", address: "scene:epilogue" },
    ]);
    expect(logicRules(undefined)).toEqual([]);
  });

  it("names what a scene's or the experience's rule cannot have", () => {
    expect(logicProblems({ rules: [
      { on: "found", do: "show" },
      { on: "tap", do: [{ hide: "hint" }, { play: "x" }, { show: "scene:a" }] },
    ], extra: 1, canvas: { notes: [{ id: "n" }], folds: [3], more: 1 } }, "l", "scene")).toEqual([
      "l.extra: unknown field of logic (rules, canvas)",
      "l.rules[0].on: found is a node's own event – a scene's rule hears an event of the bus – a scene event's name (camelCase) or a core event (targetFound, targetLost, targetUnlocked, targetTapped, sceneChanged, arState, varChanged)",
      "l.rules[0].do: show alone acts on the rule's own node – a scene's rule has none: { show: target:<targetId>/<node name> }",
      "l.rules[1].on: tap is a node's own event – a scene's rule hears an event of the bus – a scene event's name (camelCase) or a core event (targetFound, targetLost, targetUnlocked, targetTapped, sceneChanged, arState, varChanged)",
      'l.rules[1].do[0].hide: a scene\'s rule names a node by address – "hint" is not an address (target:<targetId>/<node name>)',
      "l.rules[1].do[1].node: a scene's rule names a node by address – expected an address (target:<targetId>/<node name>), got undefined",
      'l.rules[1].do[2].show: a scene\'s rule names a node by address – "scene:a": a scene address does not fit here (target:<targetId>/<node name>)',
      "l.canvas.more: unknown field of a canvas (groups, notes, folds, exposed)",
      "l.canvas.notes[0]: expected { id, text, x, y }",
      "l.canvas.folds[0]: expected a node id",
    ]);
    // Schema 5.1: the ports an author exposed per box
    expect(canvasProblems({ exposed: { "node:t/0": ["src", "p:hum.volume"] } }, "c")).toEqual([]);
    expect(canvasProblems({ exposed: { b: ["", 2] } }, "c")).toEqual(["c.exposed.b: expected a list of port ids"]);
    expect(canvasProblems({ exposed: ["src"] }, "c")).toEqual(["c.exposed: expected { <box id>: [port ids] }"]);
    expect(logicProblems([], "l", "experience")).toEqual(["l: expected { rules, canvas? }"]);
    expect(logicProblems({}, "l", "experience")).toEqual(["l.rules: expected a list of rules { on, when?, do }"]);
    expect(rulesProblems("x", "r", "entity")).toEqual(["r: expected a list of rules { on, when?, do }"]);
    expect(canvasProblems({ groups: [{ id: "g", label: "G", members: [1] }] }, "c")).toEqual(["c.groups[0]: expected { id, label, members: [node ids] }"]);
  });

  it("writes logic in the shortest form; a reader's copy has no canvas", () => {
    expect(logicData([])).toBeUndefined();
    expect(logicData([{ on: "go", when: null, do: [{ action: "goto", address: "scene:a" }] }], { folds: ["x"] }))
      .toEqual({ rules: [{ on: "go", do: { goto: "scene:a" } }], canvas: { folds: ["x"] } });
    const scene = { id: "a", logic: { rules: [], canvas: { folds: ["x"] } } };
    expect(withoutCanvas(scene)).toEqual({ id: "a", logic: { rules: [] } });
    expect(scene.logic.canvas).toEqual({ folds: ["x"] });
    const plain: { id: string; logic?: undefined } = { id: "b" };
    expect(withoutCanvas(plain)).toBe(plain);
  });
});

describe("addresses (schema 5.0)", () => {
  it("parses scene and target addresses; anything else is none", () => {
    expect(parseAddress("scene:cover")).toEqual({ scheme: "scene", id: "cover" });
    expect(parseAddress(" target:door/the hint ")).toEqual({ scheme: "target", id: "door", node: "the hint" });
    expect(parseAddress("target:door")).toEqual({ scheme: "target", id: "door", node: "" });
    expect(parseAddress("target:door/a/b")).toEqual({ scheme: "target", id: "door", node: "a/b" });
    for (const bad of ["cover", "scene:", "scene:a/b", "toon:x", "scene:a b", "Scene:a", 3, null]) expect(parseAddress(bad)).toBeNull();
    expect(formatAddress({ scheme: "target", id: "door", node: "" })).toBe("target:door");
    expect(nodeAddress("door", "hint")).toBe("target:door/hint");
    expect(sceneAddress("cover")).toBe("scene:cover");
    expect(addressProblem("scene:a", ["scene"])).toBeNull();
    expect(addressProblem("", ["scene"])).toBe('expected an address (scene:<id>), got ""');
  });
});

describe("expressions: a rule's condition (schema 5.0)", () => {
  const vars: Record<string, unknown> = { hasKey: true, tries: 3, mood: "calm" };
  const lookup = (name: string) => vars[name];

  it("parses one expression or names why not", () => {
    expect(parseExpression("hasKey && tries > 2").problems).toEqual([]);
    expect(parseExpression("hasKey and not door").problems).toEqual([]);
    expect(parseExpression("").problems[0].code).toBe("empty-expression");
    expect(parseExpression("a b").problems[0]).toMatchObject({ code: "unexpected", args: ["b"] });
    expect(parseExpression("a: b").problems[0]).toMatchObject({ code: "unexpected", args: [":"] });
    expect(parseExpression("(a").problems[0].code).toBe("missing-paren");
    expect(parseExpression("f(a)").problems[0].code).toBe("unknown-function");
  });

  it("evaluates the ink way: unset is false, texts compare as texts", () => {
    expect(evaluateExpression("hasKey && tries > 2", lookup)).toMatchObject({ ok: true, value: true });
    expect(evaluateExpression('mood == "calm"', lookup).value).toBe(true);
    expect(evaluateExpression("door", lookup)).toMatchObject({ ok: true, value: undefined });
    expect(evaluateExpression("!door", lookup).value).toBe(true);
    expect(evaluateExpression("mood > 2", lookup).ok).toBe(false);
    expect(evaluateExpression("a =", lookup).ok).toBe(false);
  });

  it("lists the variables it reads and writes literals", () => {
    expect(expressionVariables("hasKey && (tries > 2 || hasKey) && !door")).toEqual(["hasKey", "tries", "door"]);
    expect(expressionVariables("a =")).toEqual([]);
    expect(expressionLiteral('say "hi" \\o/')).toBe('"say \\"hi\\" \\\\o/"');
    expect(evaluateExpression(`mood == ${expressionLiteral('say "hi" \\o/')}`, () => 'say "hi" \\o/').value).toBe(true);
    expect(expressionLiteral(2.5)).toBe("2.5");
    expect(expressionLiteral(false)).toBe("false");
  });
});
