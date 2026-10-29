import { describe, expect, it } from "vitest";
import { NEW_PLUGIN_SOURCE, transpilePlugin } from "../compile";

/** The Code tab's browser-side compile: TypeScript in, an ES module out, errors with their line */
describe("transpilePlugin", () => {
  it("erases types and type imports, keeps the module's register export", async () => {
    const result = await transpilePlugin(
      'import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => { const n: number = 1; api.log(n); };\n',
      "fx",
    );
    expect("code" in result && result.code).toContain("export const register = (api) => { const n = 1; api.log(n); }");
    expect("code" in result && result.code).not.toContain("osct-plugin-api");
  });

  it("names the line of a syntax error", async () => {
    const result = await transpilePlugin("const a = 1;\nconst b = 2;\nconst c = ;\n", "fx");
    expect(result).toEqual({ error: { message: "Unexpected token", line: 3 } });
  });

  it("refuses a real import – plugins get three.js from the api", async () => {
    const result = await transpilePlugin('import { Group } from "three";\nexport const register = () => new Group();\n', "fx");
    expect(result).toEqual({ error: { message: "A plugin imports nothing – three.js is api.three, types with `import type`", line: 1 } });
  });

  it("the template compiles", async () => {
    const result = await transpilePlugin(NEW_PLUGIN_SOURCE, "new");
    expect("code" in result).toBe(true);
  });
});
