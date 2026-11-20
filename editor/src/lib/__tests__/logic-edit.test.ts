import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ scene: [] as unknown[][], logic: [] as unknown[][], variables: [] as unknown[][] }));
vi.mock("../api", async original => ({
  ...(await original<typeof import("../api")>()),
  putScene: vi.fn(async (...args: unknown[]) => { calls.scene.push(args); return {}; }),
  putExperienceLogic: vi.fn(async (...args: unknown[]) => { calls.logic.push(args); return { logic: null }; }),
  putExperienceVariables: vi.fn(async (...args: unknown[]) => { calls.variables.push(args); return { variables: null }; }),
}));

import { autosave } from "../autosave.svelte";
import { content } from "../content.svelte";
import { logicEdit, logicIssues } from "../logic-edit.svelte";
import { declarationProblems, parseDefault, renamed, retyped, variableRows, withDeclaration, withoutDeclaration } from "../variables-edit";

describe("the variables editor (#334 B7)", () => {
  it("lists the declared variables, then the inferred ones with where their type comes from", () => {
    const types = new Map([
      ["tries", { type: "integer" as const, scope: "stage" as const, default: 0, from: "experience.variables.tries" }],
      ["mood", { type: "string" as const, from: "scenes[0].logic.rules[0].do[0]" }],
    ]);
    expect(variableRows({ tries: { type: "integer", scope: "stage", default: 0 } }, types)).toEqual([
      { name: "tries", type: "integer", scope: "stage", default: 0, declared: true, from: "experience.variables.tries" },
      { name: "mood", type: "string", declared: false, from: "scenes[0].logic.rules[0].do[0]" },
    ]);
  });

  it("reads a default by the type and refuses one of another type", () => {
    expect(parseDefault("integer", "3")).toEqual({ value: 3 });
    expect(parseDefault("integer", "2.5")).toEqual({ problem: "a whole number – the variable is an integer" });
    expect(parseDefault("boolean", "yes")).toEqual({ problem: "true or false" });
    expect(parseDefault("string", "calm")).toEqual({ value: "calm" });
    expect(parseDefault("number", "")).toEqual({ value: undefined });
  });

  it("adds, renames, retypes and removes declarations, keeping their order", () => {
    let d = withDeclaration(null, "tries", { type: "integer", default: 2 });
    d = withDeclaration(d, "mood", { type: "string", scope: "experience" });
    expect(Object.keys(renamed(d, "tries", "turns"))).toEqual(["turns", "mood"]);
    expect(retyped(d.tries, "number")).toEqual({ type: "number", default: 2 });
    expect(retyped(d.tries, "boolean")).toEqual({ type: "boolean" });
    expect(withoutDeclaration(withoutDeclaration(d, "tries"), "mood")).toBeNull();
  });

  it("names what keeps a save off (B8): a bad name, a default of another type", () => {
    expect(declarationProblems({ tries: { type: "integer", default: 1 } })).toEqual([]);
    expect(declarationProblems({ "two words": { type: "integer" } })[0]).toMatch(/no variable name/);
    expect(declarationProblems({ tries: { type: "integer", default: "x" } } as never)).toEqual(['tries.default: "x" is no integer']);
  });
});

describe("saving a scene's and the experience's rules and the variables (#334)", () => {
  beforeEach(() => {
    calls.scene.length = 0;
    calls.logic.length = 0;
    calls.variables.length = 0;
    content.experienceId = "demo";
    content.experienceLogic = { rules: [], canvas: { notes: [{ id: "n", text: "keep me", x: 0, y: 0 }] } };
    content.experienceVariables = null;
    logicEdit.enter("demo");
  });

  it("the variables go out with PUT …/variables – none left removes the field", async () => {
    const onsaved = vi.fn(async () => {});
    logicEdit.onsaved = onsaved;
    logicEdit.setVariables({ tries: { type: "integer", default: 0 } });
    expect(logicEdit.declared()).toEqual({ tries: { type: "integer", default: 0 } });
    await autosave.flush();
    expect(calls.variables).toEqual([["demo", { tries: { type: "integer", default: 0 } }]]);
    expect(onsaved).toHaveBeenCalledWith("demo");
    // Saved: the store reads the draft again
    expect(logicEdit.variables).toBeUndefined();
    logicEdit.setVariables(null);
    await autosave.flush();
    expect(calls.variables[1]).toEqual(["demo", null]);
  });

  it("the experience's rules go out with PUT …/logic, keeping the draft's canvas", async () => {
    logicEdit.setExperience([{ on: "sceneChanged", when: "visits > 1", do: [{ action: "goto", address: "scene:end" }] }]);
    await autosave.flush();
    expect(calls.logic).toEqual([["demo", {
      rules: [{ on: "sceneChanged", when: "visits > 1", do: { goto: "scene:end" } }],
      canvas: { notes: [{ id: "n", text: "keep me", x: 0, y: 0 }] },
    }]]);
  });

  it("a scene's rules go out with PUT …/scenes/{sid} { logic } – an empty list without a canvas removes it", async () => {
    logicEdit.setScene("door", [{ on: "doorOpened", when: null, do: [{ action: "show", node: "target:door/hint" }] }]);
    expect(logicEdit.sceneRules("door")).toHaveLength(1);
    await autosave.flush();
    expect(calls.scene).toEqual([["demo", "door", { logic: { rules: [{ on: "doorOpened", do: { show: "target:door/hint" } }] } }]]);
    logicEdit.setScene("door", []);
    await autosave.flush();
    expect(calls.scene[1]).toEqual(["demo", "door", { logic: null }]);
  });

  it("rules that are not complete (a goto without its scene) are held, not sent", async () => {
    const incomplete = [{ on: "doorOpened", when: null, do: [{ action: "goto" as const, address: "" }] }];
    expect(logicIssues(incomplete, "scene")[0]).toMatch(/^rule 1 – do\.goto: expected an address/);
    logicEdit.setScene("door", incomplete);
    await autosave.flush();
    expect(calls.scene).toEqual([]);
    expect(autosave.status).toMatchObject({ state: "held" });
    logicEdit.setScene("door", []);
    await autosave.flush();
    expect(calls.scene).toHaveLength(1);
  });
});
