import { describe, expect, it, vi } from "vitest";
import { PLUGIN_API_VERSION } from "@engine/types";
import type { PluginRegistrySnapshot } from "@engine/scene/plugins";
import { transpilePlugin } from "../plugins/compile";
import { carriedPlugins, declaredRegistrations } from "../publish-plugins";

/** What a publish carries of the Code tab (#78): the saved sources transpiled, with the specs of a stage run */

const TINT = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  api.registerLayer("tint", { description: "Tints.", params: {} }, { glsl: "return rgba;" });
};
`;
const SPIN = `export const register = (api: any) => api.registerComponent("spin", { description: "Spins.", params: {} }, () => ({}));\n`;

const snapshot: PluginRegistrySnapshot = {
  plugins: {
    tint: { components: {}, layers: { tint: { description: "Tints.", params: {} } }, nodeTypes: {}, materials: {}, textures: {}, passes: {} },
    aquarium: { components: {}, layers: {}, nodeTypes: { aquarium: { description: "A tank.", params: {} } }, materials: {}, textures: {}, passes: {} },
  },
  failures: {},
};

describe("the plugins a publish carries", () => {
  it("transpiles every saved source in order: plain JavaScript, its type imports gone, the API version it was written against", async () => {
    const result = await carriedPlugins([{ id: "tint", source: TINT }, { id: "spin", source: SPIN }], transpilePlugin, null);
    if ("error" in result) throw new Error(result.error);
    expect(result.plugins.map(p => p.id)).toEqual(["tint", "spin"]);
    expect(result.plugins[0].code).toContain("export const register = (api) =>");
    expect(result.plugins[0].code).not.toContain("import");
    expect(result.plugins[0].code).not.toContain("PluginApi");
    expect(result.plugins.every(p => p.api === PLUGIN_API_VERSION)).toBe(true);
    expect(result.plugins.some(p => "registered" in p)).toBe(false);
  });

  it("adds the specs of a source that ran on the stage – its layers among the components, as the content declares them", async () => {
    const result = await carriedPlugins([{ id: "tint", source: TINT }, { id: "spin", source: SPIN }], transpilePlugin, snapshot);
    if ("error" in result) throw new Error(result.error);
    expect(result.plugins[0].registered).toEqual({ components: { tint: { description: "Tints.", params: {} } }, nodeTypes: {}, passes: {}, materials: {}, textures: {} });
    // spin did not run here; a compiled plugin's specs are no saved source's
    expect(result.plugins[1].registered).toBeUndefined();
    expect(result.plugins.map(p => p.id)).not.toContain("aquarium");
  });

  it("stops at the first source that does not compile, naming it and its line", async () => {
    const transpile = vi.fn(transpilePlugin);
    const result = await carriedPlugins([{ id: "broken", source: "export const register = () => {};\nconst c = ;\n" }, { id: "spin", source: SPIN }], transpile, null);
    expect(result).toEqual({ error: "The plugin broken does not compile (line 2): Unexpected token – fix it in the Code tab." });
    expect(transpile).toHaveBeenCalledTimes(1);
    const importing = await carriedPlugins([{ id: "threes", source: 'import { Group } from "three";\nexport const register = () => new Group();\n' }], transpilePlugin, null);
    expect(importing).toEqual({ error: expect.stringContaining("The plugin threes does not compile (line 1): A plugin imports nothing") });
  });

  it("declares a run's registrations without sharing its objects", () => {
    const declared = declaredRegistrations(snapshot.plugins.tint);
    expect(declared.components).not.toBe(snapshot.plugins.tint.layers);
    expect(Object.keys(declared)).toEqual(["components", "nodeTypes", "passes", "materials", "textures"]);
  });
});
