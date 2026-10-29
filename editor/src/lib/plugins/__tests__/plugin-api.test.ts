import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { generatePluginApi, OUTPUT } from "../../../../tools/plugin-api/generate.mjs";
import { NEW_PLUGIN_SOURCE } from "../compile";

const editorRoot = path.resolve(__dirname, "../../../..");
const fixturePlugin = path.resolve(editorRoot, "../fixtures/content/plugins/tint/index.ts");

/** Type-check one plugin source against the generated declarations, with three's types – as the content build does */
const diagnosticsOf = (source: string, declarations: string): string[] => {
  const dir = fs.mkdtempSync(path.join(editorRoot, "node_modules", ".plugin-api-test-"));
  try {
    fs.writeFileSync(path.join(dir, "plugin-api.d.ts"), declarations);
    fs.writeFileSync(path.join(dir, "index.ts"), source);
    const program = ts.createProgram([path.join(dir, "index.ts")], {
      strict: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2020.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      types: [],
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
      paths: {
        "osct-plugin-api": [path.join(dir, "plugin-api.d.ts")],
        three: [path.join(editorRoot, "node_modules/@types/three/index.d.ts")],
        "three/*": [path.join(editorRoot, "node_modules/@types/three/*")],
      },
    });
    return ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** `plugin-api.d.ts`: the plugin API as one declaration file, generated from the engine and checked in */
describe("plugin-api.d.ts", () => {
  const generated = generatePluginApi();

  it("is up to date with the engine's sources (npm run plugin-api)", () => {
    expect(fs.readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n")).toBe(generated);
  });

  it("declares the API a plugin uses and imports nothing but three", () => {
    for (const name of ["PluginApi", "ComponentSpec", "ComponentContext", "ComponentInstance", "LayerDefinition", "PassSpec", "PassContext", "PluginEvents", "PluginVars"]) {
      expect(generated).toMatch(new RegExp(`export (interface|type) ${name}\\b`));
    }
    const imports = [...generated.matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map(m => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every(from => from === "three" || from.startsWith("three/"))).toBe(true);
  });

  it("type-checks the fixture's plugin and the new-plugin template", () => {
    expect(diagnosticsOf(fs.readFileSync(fixturePlugin, "utf8"), generated)).toEqual([]);
    expect(diagnosticsOf(NEW_PLUGIN_SOURCE, generated)).toEqual([]);
  });

  it("reports a wrong use of the API", () => {
    const plugin = (body: string) => `import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => { ${body} };\n`;
    expect(diagnosticsOf(plugin('api.registerLayer("x", { params: {} }, { glsl: "" });'), generated).some(p => p.includes("description"))).toBe(true);
    expect(diagnosticsOf(plugin('api.registerLayer("x", { description: "", params: {} }, { glsl: 1 });'), generated).some(p => p.includes("number") && p.includes("string"))).toBe(true);
    expect(diagnosticsOf(plugin("api.three.Vector4x;"), generated).some(p => p.includes("Vector4x"))).toBe(true);
  });
});
