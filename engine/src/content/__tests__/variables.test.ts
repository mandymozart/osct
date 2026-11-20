import { describe, expect, it } from "vitest";
import { readRules } from "@shared/types/behaviour";
import { contentRuleLists, ruleTypeProblems, sourceType, variablesProblems, variableTypes } from "@shared/types/variables";

/** Typed variables (content schema 5.0, #334 B7): declared or inferred, expressions typed with the parser's tree */
describe("typed variables (schema 5.0, B7)", () => {
  const lists = (rules: unknown[], path = "r") => [{ rules: readRules(rules), path }];

  it("checks declarations", () => {
    expect(variablesProblems({ tries: { type: "integer", scope: "stage", default: 0 }, mood: { type: "string", default: "calm" } }, "v")).toEqual([]);
    expect(variablesProblems({ Bad: { type: "integer" }, a: { type: "float" }, b: { type: "integer", default: 1.5 }, c: { type: "boolean", scope: "world", extra: 1 } }, "v")).toEqual([
      "v.Bad: not a variable name (camelCase letters and digits)",
      'v.a.type: expected number, integer, boolean, string, got "float"',
      "v.b.default: 1.5 is no integer",
      "v.c.extra: unknown field of a variable (type, scope, default)",
      'v.c.scope: expected one of scene, stage, session, experience, got "world"',
    ]);
  });

  it("types expressions with the parser's tree", () => {
    const types: Record<string, "integer" | "number" | "boolean" | "string"> = { tries: "integer", speed: "number", open: "boolean", mood: "string" };
    const typeOf = (source: string) => sourceType(source, name => types[name]);
    expect(typeOf("tries + 1")).toEqual({ type: "integer", problems: [] });
    expect(typeOf("tries / 2").type).toBe("number");
    expect(typeOf("speed * tries").type).toBe("number");
    expect(typeOf('mood + "!"').type).toBe("string");
    expect(typeOf("tries > 2 && !open")).toEqual({ type: "boolean", problems: [] });
    expect(typeOf("plugin + 1").type).toBe("unknown");
    expect(typeOf("mood + 1").problems).toEqual(["+ joins two texts or adds two numbers – not a text and a whole number"]);
    expect(typeOf("open && tries").problems).toEqual(["&& needs true / false on both sides, not a whole number"]);
    expect(typeOf('tries == "3"').problems).toEqual(["== compares a whole number with a text"]);
    expect(typeOf("tries == 2.5").problems).toEqual([]);
    expect(typeOf("mood > 1").problems).toEqual(["> compares numbers, not a text"]);
    expect(typeOf("!tries").problems).toEqual(["! needs true / false, not a whole number"]);
  });

  it("declared, else inferred from the first set; sets, tests and conditions of another type are problems", () => {
    const rules = [
      { on: "a", do: [{ set: { tries: "tries + 1", open: true, mood: '"calm"' } }] },
      { on: "b", when: "tries", do: { set: { open: 1, speed: 2 } } },
      { on: "c", when: "mood == 3 || open", do: [{ set: { speed: 0.5 } }, { set: { tries: 1 }, scope: "scene" }] },
    ];
    const types = variableTypes({ tries: { type: "integer", scope: "stage", default: 0 } }, lists(rules));
    expect([...types].map(([name, info]) => [name, info.type, info.from])).toEqual([
      ["tries", "integer", "experience.variables.tries"], ["open", "boolean", "r[0].do[1]"], ["mood", "string", "r[0].do[2]"], ["speed", "integer", "r[1].do[1]"],
    ]);
    expect(ruleTypeProblems(lists(rules), types)).toEqual([
      'r[1].when: a condition is true / false – "tries" is a number',
      'r[1].do[0].set.open: open is a boolean (r[0].do[1]) – "1" is an integer',
      'r[2].when: == compares a text with a whole number – "mood == 3 || open"',
      'r[2].do[0].set.speed: speed is an integer (r[1].do[1]) – "0.5" is a number',
      "r[2].do[1].set.tries: tries lives in scope stage (experience.variables.tries), not scene",
    ]);
  });

  it("lists every rule list of a configuration in content order", () => {
    const behaviour = { type: "behaviour", rules: [{ on: "tap", do: { set: { a: 1 } } }] };
    const config = {
      experience: { logic: { rules: [{ on: "x", do: { set: { a: '"t"' } } }] } },
      scenes: [{ logic: { rules: [] } }],
      entities: { e: { type: "group", children: [{ type: "text", components: [behaviour] }] } },
      entries: [{ target: { entity: { ref: "e" } } }, { target: { entity: { type: "text", components: [behaviour] } } }],
    };
    expect(contentRuleLists(config).map(list => list.path)).toEqual([
      "experience.logic.rules", "scenes[0].logic.rules", "entities.e.children[0].components[0].rules", "entries[1].target.entity.components[0].rules",
    ]);
    expect(variableTypes(undefined, contentRuleLists(config)).get("a")?.type).toBe("string");
  });
});
