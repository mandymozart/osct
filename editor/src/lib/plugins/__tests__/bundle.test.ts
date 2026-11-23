import { describe, expect, it } from "vitest";
import { buildPlugin, resolveFile, type Esbuild } from "../bundle";

/** esbuild-wasm in Node: it starts without a wasm URL */
let started: Promise<Esbuild> | null = null;
const nodeEsbuild = (): Promise<Esbuild> => {
  started ??= import("esbuild-wasm").then(async module => {
    await module.initialize({});
    return module;
  });
  return started;
};

const ENTRY = `import type { PluginApi } from "osct-plugin-api";
import { speed } from "./fluid";
import WATER from "./water.frag";
export const register = (api: PluginApi): void => { api.log(speed(2), WATER.length); };
`;

/** A plugin of several files (#352): bundled in the browser, its siblings and shaders in, nothing else */
describe("buildPlugin", () => {
  it("a plugin of one file is transpiled as before (no bundler)", async () => {
    const result = await buildPlugin([{ name: "index.ts", text: "export const register = (api: unknown) => {};\n" }], "one", () => Promise.reject(new Error("not needed")));
    expect("code" in result && result.code).toContain("export const register");
  });

  it("bundles the entry with a TypeScript sibling and a shader as a string", async () => {
    const result = await buildPlugin([
      { name: "index.ts", text: ENTRY },
      { name: "fluid.ts", text: "export const speed = (n: number): number => n * 2;\n" },
      { name: "water.frag", text: "void main() { gl_FragColor = vec4(1.0); }\n" },
    ], "aquarium", nodeEsbuild);
    if (!("code" in result)) throw new Error(result.error.message);
    expect(result.code).toContain("n * 2");
    expect(result.code).toContain("gl_FragColor");
    expect(result.code).toMatch(/export\s*\{[^}]*register/);
    expect(result.code).not.toContain("osct-plugin-api");
    // It runs: the module's register is there
    const module = await import(`data:text/javascript,${encodeURIComponent(result.code)}`);
    const lines: unknown[][] = [];
    module.register({ log: (...args: unknown[]) => lines.push(args) });
    expect(lines).toEqual([[4, 42]]);
  });

  it("refuses a bare import, as the content build does", async () => {
    const result = await buildPlugin([
      { name: "index.ts", text: 'import { Group } from "three";\nexport const register = () => new Group();\n' },
      { name: "a.ts", text: "export {};\n" },
    ], "bad", nodeEsbuild);
    expect("error" in result && result.error.message).toContain("a plugin imports nothing");
    expect("error" in result && result.error.file).toBe("index.ts");
    expect("error" in result && result.error.line).toBe(1);
  });

  it("names the file and the line of an error in a sibling", async () => {
    const result = await buildPlugin([
      { name: "index.ts", text: 'import { x } from "./b";\nexport const register = () => x;\n' },
      { name: "b.ts", text: "export const x = 1;\nexport const y = ;\n" },
    ], "broken", nodeEsbuild);
    expect("error" in result && result.error).toMatchObject({ file: "b.ts", line: 2 });
  });

  it("an import of a file the plugin does not have", async () => {
    const result = await buildPlugin([
      { name: "index.ts", text: 'import { x } from "./gone";\nexport const register = () => x;\n' },
      { name: "b.ts", text: "export {};\n" },
    ], "missing", nodeEsbuild);
    expect("error" in result && result.error.message).toContain('"./gone" is no file of this plugin');
  });
});

describe("resolveFile", () => {
  it("finds ./name as name.ts or the name itself, never a folder", () => {
    const names = ["index.ts", "fluid.ts", "water.frag"];
    expect(resolveFile(names, "./fluid")).toBe("fluid.ts");
    expect(resolveFile(names, "./fluid.ts")).toBe("fluid.ts");
    expect(resolveFile(names, "./water.frag")).toBe("water.frag");
    expect(resolveFile(names, "./lib/fluid")).toBeNull();
    expect(resolveFile(names, "./sea")).toBeNull();
  });
});
