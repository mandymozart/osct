import { describe, expect, it } from "vitest";
import { enabledPasses, isPassEnabled, PASS_FIELDS, PASS_TYPES, passBudgetWarning, passProblems, resolvePass, PASSES } from "@shared/types/passes";
import { assertGameConfiguration } from "@shared/guards/game-config";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";

describe("post-processing passes (content schema 2.5)", () => {
  it("the grade reaches the AR layer by default, the whole picture with reach: all (schema 2.9)", () => {
    expect(PASSES.grade.params.reach).toMatchObject({ kind: "choice", options: ["ar", "all"], default: "ar" });
    expect(resolvePass(PASSES.grade, { type: "grade" }).reach).toBe("ar");
    expect(passProblems([{ type: "grade", reach: "all" }], "passes")).toEqual([]);
    expect(passProblems([{ type: "grade", reach: "camera" }], "passes")).toEqual(['passes[0].reach: expected one of ar, all, got "camera"']);
  });

  it("the guard ignores a parameter it does not know (a newer MINOR's), the build refuses it", () => {
    expect(passProblems([{ type: "grade", later: 1 }], "passes", { unknownParams: "ignore" })).toEqual([]);
    expect(passProblems([{ type: "grade", later: 1, contrast: 5 }], "passes", { unknownParams: "ignore" })).toEqual(["passes[0].contrast: expected a number from 0 to 2, got 5"]);
    expect(passProblems([{ type: "grade", later: 1 }], "passes")).toEqual(["passes[0].later: unknown parameter of grade (reach, exposure, contrast, saturation, tint)"]);
  });

  it("has the built-in types", () => {
    expect(PASS_TYPES).toEqual(["bloom", "vignette", "grade"]);
  });

  it("accepts valid passes and resolves the defaults", () => {
    expect(passProblems([{ type: "bloom", strength: 0.8 }, { type: "vignette", color: "#102030" }, { type: "grade" }], "passes")).toEqual([]);
    expect(resolvePass(PASSES.bloom, { type: "bloom", strength: 0.8 })).toEqual({ strength: 0.8, radius: 0.4, threshold: 0.85 });
  });

  it("reports unknown types, unknown parameters and values out of range", () => {
    expect(passProblems([
      { type: "glow" },
      { type: "bloom", strength: 9, colour: "#fff" },
      { type: "vignette", color: "red" },
      "bloom",
    ], "passes")).toEqual([
      'passes[0].type: "glow" is not one of bloom, vignette, grade',
      "passes[1].strength: expected a number from 0 to 3, got 9",
      "passes[1].colour: unknown parameter of bloom (strength, radius, threshold)",
      'passes[2].color: expected a color "#rrggbb", got "red"',
      "passes[3]: expected { type, ...parameters }",
    ]);
    expect(passProblems({}, "passes")).toEqual(["passes: expected a list of passes"]);
  });

  it("accepts a type it does not know only where plugins may register it", () => {
    expect(passProblems([{ type: "mine" }], "passes", { unknownTypes: "allow" })).toEqual([]);
    expect(passProblems([{ type: "mine", amount: 2 }], "passes", {
      spec: type => (type === "mine" ? { description: "", params: { amount: { kind: "number", default: 1, min: 0, max: 1, description: "" } } } : undefined),
    })).toEqual(["passes[0].amount: expected a number from 0 to 1, got 2"]);
  });

  it("the guard checks the book's and a spread's passes", () => {
    const config = (passes: unknown, bookPasses?: unknown) => ({
      version: { version: "1.0.0", timestamp: "2026-10-29", schema: CONTENT_SCHEMA_VERSION },
      book: { id: "b", title: "B", author: "A", ...(bookPasses !== undefined ? { passes: bookPasses } : {}) },
      initialSpreadId: "s",
      spreads: [{ id: "s", title: "S", firstPage: 1, lastPage: 2, ...(passes !== undefined ? { passes } : {}) }],
      entries: [],
      entities: {},
      tutorial: [],
    });
    expect(() => assertGameConfiguration(config([{ type: "bloom" }], [{ type: "vignette", strength: 0.3 }]))).not.toThrow();
    expect(() => assertGameConfiguration(config([{ type: "glow" }]))).toThrow(/spreads\[0\]\.passes\[0\]\.type/);
    expect(() => assertGameConfiguration(config(undefined, [{ type: "grade", contrast: 5 }]))).toThrow(/book\.passes\[0\]\.contrast/);
    expect(() => assertGameConfiguration(config([{ type: "grade", reach: "all", later: true }]))).not.toThrow();
    expect(() => assertGameConfiguration(config([{ type: "bloom", enabled: false }], [{ type: "vignette", enabled: true }]))).not.toThrow();
    expect(() => assertGameConfiguration(config([{ type: "bloom", enabled: "off" }]))).toThrow(/spreads\[0\]\.passes\[0\]\.enabled/);
  });

  it("the phone budget (#86): up to three passes and one bloom, a plugin's pass counting like a built-in one", () => {
    expect(passBudgetWarning([{ type: "bloom" }, { type: "vignette" }, { type: "scanLines" }])).toBeNull();
    expect(passBudgetWarning([{ type: "bloom" }, { type: "vignette" }, { type: "grade" }, { type: "scanLines" }])).toBe("4 passes (the phone budget is 3) – every pass is a full-screen render on the phone");
    expect(passBudgetWarning([{ type: "bloom" }, { type: "bloom" }])).toBe("2 blooms (one fits) – every pass is a full-screen render on the phone");
    // A pass that is off costs nothing (#233)
    expect(passBudgetWarning([{ type: "bloom" }, { type: "bloom", enabled: false }, { type: "vignette" }, { type: "grade", enabled: false }])).toBeNull();
  });

  it("a pass may be switched off (schema 2.22, #233): the guard and the build accept a boolean, nothing else", () => {
    expect(passProblems([{ type: "bloom", enabled: false }, { type: "grade", enabled: true, contrast: 1.2 }], "passes")).toEqual([]);
    expect(passProblems([{ type: "bloom", enabled: "no" }], "passes")).toEqual(['passes[0].enabled: expected true or false, got "no"']);
    expect(passProblems([{ type: "bloom", enabled: 0 }], "passes", { unknownParams: "ignore" })).toEqual(["passes[0].enabled: expected true or false, got 0"]);
    // A plugin's pass too
    const spec = (type: string) => (type === "grain" ? { description: "", params: {} } : undefined);
    expect(passProblems([{ type: "grain", enabled: false }], "passes", { spec })).toEqual([]);
    expect(isPassEnabled({})).toBe(true);
    expect(isPassEnabled({ enabled: true })).toBe(true);
    expect(isPassEnabled({ enabled: false })).toBe(false);
    expect(enabledPasses([{ type: "bloom", enabled: false }, { type: "vignette" }])).toEqual([{ type: "vignette" }]);
    expect(resolvePass(PASSES.bloom, { type: "bloom", enabled: false })).toEqual({ strength: 1, radius: 0.4, threshold: 0.85 });
    expect(PASS_FIELDS).toEqual(["type", "enabled"]);
  });
});
