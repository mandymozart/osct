import { afterEach, describe, expect, it } from "vitest";
import { installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import type { PassSpec, PluginData } from "@engine/types";
import { movePass } from "../passes-edit";
import { passGroups, pluginOfPass, registeredPasses, specOfPass, type RegisteredPass } from "../plugin-passes";
import { passRows, passValue, setPassValue } from "../values";

/** The post-processing section's plugin passes (#216): what *add pass* offers, grouped, and the rows of a plugin's pass */

const GRAIN: PassSpec = {
  description: "Film grain.",
  params: {
    amount: { kind: "number", default: 0.08, min: 0, max: 0.4, step: 0.01, label: "grain", description: "How strong." },
    animated: { kind: "boolean", default: true, description: "Moves." },
    pattern: { kind: "texture", default: "", description: "A picture as the grain." },
  },
};
const SCAN: PassSpec = { description: "Scan lines.", params: { lines: { kind: "number", default: 200, min: 10, max: 800, description: "How many." } } };

const declared = (id: string, passes: Record<string, PassSpec>): PluginData => ({ id, src: `/assets/content/plugins/${id}/plugin.js`, api: "1.6", registered: { passes } });

describe("add pass: the built-in passes and the plugins' passes, grouped", () => {
  it("built in first, then each plugin's passes under its id – recorded ones before they load", () => {
    const groups = passGroups([], [declared("scan", { scanLines: SCAN }), declared("grain", { filmGrain: GRAIN })]);
    expect(groups.map(g => [g.label, g.choices.map(c => c.type)])).toEqual([
      ["built-in", ["bloom", "vignette", "grade"]],
      ["grain", ["filmGrain"]],
      ["scan", ["scanLines"]],
    ]);
    expect(groups[1].choices[0]).toMatchObject({ plugin: "grain", spec: GRAIN });
  });

  it("a pass in the registry (a plugin loaded or run in the Code tab) wins over a record; the engine's own are the built-in group", () => {
    const registered: RegisteredPass[] = [
      { type: "bloom", owner: "engine", spec: SCAN },
      { type: "filmGrain", owner: "grain", spec: { ...GRAIN, description: "Ran." } },
      { type: "halo", owner: "sketch", spec: SCAN },
    ];
    const groups = passGroups(registered, [declared("grain", { filmGrain: GRAIN })]);
    expect(groups.map(g => g.label)).toEqual(["built-in", "grain", "sketch"]);
    expect(specOfPass("filmGrain", registered, [])?.description).toBe("Ran.");
    expect(specOfPass("bloom", registered, [])?.description).toMatch(/Bright parts/);
    expect(pluginOfPass("halo", registered, [])).toBe("sketch");
    expect(pluginOfPass("vignette", registered, [])).toBeNull();
    expect(specOfPass("nobody", registered, [])).toBeUndefined();
  });

  it("a plugin run in the Code tab offers its pass at once – it is in the engine's registry – and leaves with it", () => {
    installPlugin("sketch", { register: api => api.registerPass("halo", SCAN, ({ shaderPass }) => shaderPass("void main() {}")) });
    expect(passGroups(registeredPasses(), []).find(g => g.plugin === "sketch")?.choices.map(c => c.type)).toEqual(["halo"]);
    uninstallPlugin("sketch");
    expect(passGroups(registeredPasses(), []).some(g => g.plugin === "sketch")).toBe(false);
  });
});

describe("a plugin pass's rows", () => {
  afterEach(() => uninstallPlugin("grain"));
  const specOf = (type: string) => specOfPass(type, [], [declared("grain", { filmGrain: GRAIN })]);

  it("come from its spec – labels, ranges, every kind, a texture too", () => {
    const rows = passRows({ type: "filmGrain" }, 1, specOf);
    expect(rows.map(row => [row.id, row.kind, row.label])).toEqual([
      ["passes.1.amount", "number", "grain"],
      ["passes.1.animated", "boolean", "animated"],
      ["passes.1.pattern", "texture", "pattern"],
    ]);
    expect(rows[0]).toMatchObject({ min: 0, max: 0.4, step: 0.01, default: 0.08, description: "How strong." });
    expect(passRows({ type: "unknownPass" }, 0, specOf)).toEqual([]);
  });

  it("a boolean is written as one and dropped at its default, a texture as its URL", () => {
    const [, animated, pattern] = passRows({ type: "filmGrain" }, 0, specOf);
    const off = setPassValue({ type: "filmGrain" }, animated, "false");
    expect(off).toEqual({ type: "filmGrain", animated: false });
    expect(passValue(off, animated)).toBe("false");
    expect(setPassValue(off, animated, "true")).toEqual({ type: "filmGrain" });
    expect(setPassValue({ type: "filmGrain" }, pattern, "https://cdn.example/grain.png")).toEqual({ type: "filmGrain", pattern: "https://cdn.example/grain.png" });
  });

  it("the default lookup reads the engine's registry: a running plugin's pass has rows", () => {
    installPlugin("grain", { register: api => api.registerPass("filmGrain", GRAIN, ({ shaderPass }) => shaderPass("void main() {}")) });
    expect(passRows({ type: "filmGrain" }, 0).map(row => row.label)).toEqual(["grain", "animated", "pattern"]);
  });
});

describe("reordering the list", () => {
  const list = [{ type: "bloom" }, { type: "filmGrain" }, { type: "vignette" }];

  it("moves a pass up or down; past an end nothing changes", () => {
    expect(movePass(list, 1, -1).map(p => p.type)).toEqual(["filmGrain", "bloom", "vignette"]);
    expect(movePass(list, 1, 1).map(p => p.type)).toEqual(["bloom", "vignette", "filmGrain"]);
    expect(movePass(list, 0, -1)).toEqual(list);
    expect(movePass(list, 2, 1)).toEqual(list);
    expect(movePass(list, 0, -1)).not.toBe(list);
  });
});
