import { describe, expect, it } from "vitest";
import { behaviourData, behaviourEvents, behaviourRules, behaviourVariables, describeActions } from "@shared/types/behaviour";
import { componentProblems } from "@shared/types/components";

/** The built-in behaviour component – its grammar, checked by the build and the guard */
describe("behaviour: the content's grammar", () => {
  const key = {
    type: "behaviour",
    rules: [
      { on: "tap", do: [{ play: "rattle" }, { set: { hasKey: true }, scope: "book" }, { emit: "keyRattled" }] },
      { on: "found", when: { hasKey: true }, do: "play" },
      { on: "found", when: { any: { hasKey: true, tries: { not: 3 } } }, do: { hide: "hint" } },
      { on: "doorOpened", when: { doorOpen: null }, do: [{ show: "" }, "stop", { pause: "door" }, { play: "", node: "door" }, { set: { tries: null } }] },
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
        { on: "tap", when: { any: { a: 1 }, b: 2 }, do: { play: 3, node: 4 } },
        { on: "tap", when: { a: [1] }, do: [{ set: {} }, { set: { x: { y: 1 } }, scope: "world" }, { emit: "targetFound" }, { emit: "tap" }, { show: "a", hide: "b" }, { emit: "x", node: "a" }] },
        "nope",
      ],
    }], "components")).toEqual([
      "components[0].extra: unknown field of behaviour (rules)",
      'components[0].rules[0].on: expected an event – found, lost, tap, unlocked or an event\'s name (camelCase), got "Found Me"',
      'components[0].rules[0].do: expected an action – play, pause, stop, show, hide or { play | pause | stop | show | hide | set | emit: … }, got "dance"',
      "components[0].rules[1].do: a rule needs an action or a list of actions",
      "components[0].rules[2].when: any stands alone – { any: { variable: value, … } }",
      "components[0].rules[2].do.play: expected a clip's name (empty = the node's own clip), got 3",
      "components[0].rules[2].do.node: expected a node's name (empty = the behaviour's own node), got 4",
      "components[0].rules[3].when.a: expected a value (text, number, true / false, null = not set) or { not: value }, got [1]",
      "components[0].rules[3].do[0].set: expected { variable: value, … }",
      'components[0].rules[3].do[1].set.x: expected a text, a number, true / false or null (deletes), got {"y":1}',
      'components[0].rules[3].do[1].scope: expected one of spread, stage, session, book, got "world"',
      "components[0].rules[3].do[2].emit: targetFound is the engine's own event – a rule hears it, never emits it",
      "components[0].rules[3].do[3].emit: tap is the engine's own event – a rule hears it, never emits it",
      "components[0].rules[3].do[4]: an action has one of play, pause, stop, show, hide, set, emit, got show and hide",
      "components[0].rules[3].do[5].node: unknown field of emit",
      "components[0].rules[4]: expected a rule { on, when?, do }",
    ]);
    expect(componentProblems([{ type: "behaviour", rules: {} }], "c")).toEqual(["c[0].rules: expected a list of rules { on, when?, do }"]);
  });

  it("reads the content into rules: shorthands, any, not, null, a set of several variables", () => {
    const rules = behaviourRules(key);
    expect(rules[0]).toEqual({ on: "tap", when: null, do: [
      { action: "play", clip: "rattle", node: "" },
      { action: "set", name: "hasKey", value: true, scope: "book" },
      { action: "emit", event: "keyRattled" },
    ] });
    expect(rules[1]).toEqual({ on: "found", when: { match: "all", tests: [{ name: "hasKey", value: true, not: false }] }, do: [{ action: "play", clip: "", node: "" }] });
    expect(rules[2].when).toEqual({ match: "any", tests: [{ name: "hasKey", value: true, not: false }, { name: "tries", value: 3, not: true }] });
    expect(rules[3].do).toEqual([
      { action: "show", node: "" }, { action: "stop", node: "" }, { action: "pause", node: "door" }, { action: "play", clip: "", node: "door" },
      { action: "set", name: "tries", value: null, scope: "spread" },
    ]);
    expect(behaviourRules({ rules: [{ on: "tap", do: { set: { a: 1, b: "x" } } }] })[0].do)
      .toEqual([{ action: "set", name: "a", value: 1, scope: "spread" }, { action: "set", name: "b", value: "x", scope: "spread" }]);
    expect(behaviourRules(undefined)).toEqual([]);
  });

  it("writes rules back in the shortest form, which reads the same again", () => {
    const data = behaviourData(behaviourRules(key));
    expect(data.rules[1]).toEqual({ on: "found", when: { hasKey: true }, do: "play" });
    expect(data.rules[3]).toEqual({ on: "doorOpened", when: { doorOpen: null }, do: ["show", "stop", { pause: "door" }, { play: "", node: "door" }, { set: { tries: null } }] });
    expect(behaviourRules(data)).toEqual(behaviourRules(key));
    expect(componentProblems([data], "components")).toEqual([]);
    // an any with one test is a plain condition; an empty condition is none
    expect(behaviourData([{ on: "tap", when: { match: "any", tests: [{ name: "a", value: 1, not: false }] }, do: [] }]).rules[0])
      .toEqual({ on: "tap", when: { a: 1 }, do: [] });
    expect(behaviourData([{ on: "tap", when: { match: "all", tests: [] }, do: [{ action: "emit", event: "x" }] }]).rules[0]).toEqual({ on: "tap", do: { emit: "x" } });
  });

  it("lists the variables and bus events the rules use, and describes actions for the log", () => {
    const rules = behaviourRules(key);
    expect(behaviourVariables(rules)).toEqual(["doorOpen", "hasKey", "tries"]);
    expect(behaviourEvents(rules)).toEqual(["doorOpened", "keyRattled"]);
    expect(describeActions(rules[0].do)).toBe("play rattle · set hasKey = true (book) · emit keyRattled");
    expect(describeActions(rules[3].do)).toBe("show · stop · pause door · play its clip on door · set tries = unset");
  });
});
