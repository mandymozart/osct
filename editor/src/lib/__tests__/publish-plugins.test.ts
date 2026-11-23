import type { PluginFile } from "@shared/types/plugins";
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
    tint: { components: {}, layers: { tint: { description: "Tints.", params: {} } }, nodeTypes: {}, materials: {}, textures: {}, passes: {}, appearances: {} },
    aquarium: { components: {}, layers: {}, nodeTypes: { aquarium: { description: "A tank.", params: {} } }, materials: {}, textures: {}, passes: {}, appearances: {} },
  },
  failures: {},
};

/** The browser's build of one file (sucrase) – what a publish uses for a plugin of one file */
const build = (files: readonly PluginFile[], name: string) => transpilePlugin(files[0].text, name);

describe("the plugins a publish carries", () => {
  it("transpiles every saved source in order: plain JavaScript, its type imports gone, the API version it was written against", async () => {
    const result = await carriedPlugins([{ id: "tint", files: [{ name: "index.ts", text: TINT }] }, { id: "spin", files: [{ name: "index.ts", text: SPIN }] }], build, null);
    if ("error" in result) throw new Error(result.error);
    expect(result.plugins.map(p => p.id)).toEqual(["tint", "spin"]);
    expect(result.plugins[0].code).toContain("export const register = (api) =>");
    expect(result.plugins[0].code).not.toContain("import");
    expect(result.plugins[0].code).not.toContain("PluginApi");
    expect(result.plugins.every(p => p.api === PLUGIN_API_VERSION)).toBe(true);
    expect(result.plugins.some(p => "registered" in p)).toBe(false);
  });

  it("adds the specs of a source that ran on the stage – its layers among the components, as the content declares them", async () => {
    const result = await carriedPlugins([{ id: "tint", files: [{ name: "index.ts", text: TINT }] }, { id: "spin", files: [{ name: "index.ts", text: SPIN }] }], build, snapshot);
    if ("error" in result) throw new Error(result.error);
    expect(result.plugins[0].registered).toEqual({ components: { tint: { description: "Tints.", params: {} } }, nodeTypes: {}, passes: {}, materials: {}, textures: {} });
    // spin did not run here; a compiled plugin's specs are no saved source's
    expect(result.plugins[1].registered).toBeUndefined();
    expect(result.plugins.map(p => p.id)).not.toContain("aquarium");
  });

  it("stops at the first source that does not compile, naming it and its line", async () => {
    const transpile = vi.fn(build);
    const result = await carriedPlugins([{ id: "broken", files: [{ name: "index.ts", text: "export const register = () => {};\nconst c = ;\n" }] },{ id: "spin", files: [{ name: "index.ts", text: SPIN }] }], transpile, null);
    expect(result).toEqual({ error: "The plugin broken does not build (line 2): Unexpected token – fix it in the Code tab." });
    expect(transpile).toHaveBeenCalledTimes(1);
    const importing = await carriedPlugins([{ id: "threes", files: [{ name: "index.ts", text: 'import { Group } from "three";\nexport const register = () => new Group();\n' }] }], build, null);
    expect(importing).toEqual({ error: expect.stringContaining("The plugin threes does not build (line 1): A plugin imports nothing") });
  });

  it("declares a run's registrations without sharing its objects, its looks only when it has some", () => {
    const declared = declaredRegistrations(snapshot.plugins.tint);
    expect(declared.components).not.toBe(snapshot.plugins.tint.layers);
    expect(Object.keys(declared)).toEqual(["components", "nodeTypes", "passes", "materials", "textures"]);
    const look = { description: "Glows in.", params: {} } as unknown as NonNullable<typeof snapshot.plugins.tint.appearances>[string];
    expect(declaredRegistrations({ ...snapshot.plugins.tint, appearances: { glowIn: look } }).appearances).toEqual({ glowIn: look });
  });
});

describe("a publish's type check and sizes (#352)", () => {
  it("a type error stops the publish with its plugin, file and line – nothing is built", async () => {
    const built = vi.fn(build);
    const result = await carriedPlugins([{ id: "tint", files: [{ name: "index.ts", text: TINT }] }], built, null,
      async () => [{ plugin: "tint", file: "fluid.ts", line: 4, message: "Type 'string' is not assignable to type 'number'." }, { plugin: "tint", file: "index.ts", line: 1, message: "x" }]);
    expect(result).toEqual({ error: "The plugin tint has a type error in fluid.ts line 4: Type 'string' is not assignable to type 'number'. (and 1 more) – fix it in the Code tab." });
    expect(built).not.toHaveBeenCalled();
  });

  it("a bundle above 256 KB is a warning, not a stop", async () => {
    const big = `export const register = () => {};\nexport const data = "${"x".repeat(300 * 1024)}";\n`;
    const result = await carriedPlugins([{ id: "big", files: [{ name: "index.ts", text: big }] }], build, null, async () => []);
    if ("error" in result) throw new Error(result.error);
    expect(result.plugins).toHaveLength(1);
    expect(result.warnings).toEqual([expect.stringMatching(/^big is 30\d KB bundled – readers download it with the AR scene$/)]);
  });

  it("a build error in a sibling names the file", async () => {
    const result = await carriedPlugins([{ id: "sea", files: [{ name: "index.ts", text: "x" }, { name: "fluid.ts", text: "y" }] }],
      async () => ({ error: { message: "Expected \";\"", line: 3, file: "fluid.ts" } }), null);
    expect(result).toEqual({ error: 'The plugin sea does not build in fluid.ts (line 3): Expected ";" – fix it in the Code tab.' });
  });
});
