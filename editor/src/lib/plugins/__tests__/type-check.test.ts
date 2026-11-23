// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { THREE_TYPES_PATH, type PluginSources } from "@shared/plugins/type-check";
import { threeTypesByPath } from "../three-types";
import { checkLibs, checkWithMonacoTypeScript, checkWithMonacoWorker, checkWithNodeTypeScript, folderPlugins, problemLines, repoRoot } from "./node-check";

// The type check builds a TypeScript program with three's declarations: seconds on a busy machine
vi.setConfig({ testTimeout: 30_000 });

/**
 * One type check, two runtimes (#366): the shared definition run in Node gives the verdict Monaco's TypeScript worker gives
 * in the browser – the same sources, the same problems (plugin, file, line, message)
 */

const AQUARIUM = readFileSync(resolve(repoRoot, "fixtures/demo/plugins/aquarium/index.ts"), "utf8");

/** Sources of several kinds: good, a type error, a syntax error, a plugin of several files with a shader, a bad sibling import */
const SOURCES: PluginSources[] = [
  { id: "aquarium", files: [{ name: "index.ts", text: AQUARIUM }] },
  {
    id: "wrong",
    files: [{ name: "index.ts", text: `import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => {\n  const n: number = "one";\n  api.registerLayer(42, {});\n};\n` }],
  },
  { id: "broken", files: [{ name: "index.ts", text: "export const register = (api) => {\n  api.log(\n" }] },
  {
    id: "several",
    files: [
      { name: "index.ts", text: `import type { PluginApi } from "osct-plugin-api";\nimport { tint } from "./tint";\nimport WATER from "./water.frag";\nexport const register = (api: PluginApi): void => {\n  api.log(WATER.length + tint(2));\n};\n` },
      { name: "tint.ts", text: `export const tint = (x: number): number => x * 2;\nexport const bad: string = tint(1);\n` },
      { name: "water.frag", text: "uniform float uTime;\nvoid main() { gl_FragColor = vec4(1.0); }\n" },
    ],
  },
  { id: "lost", files: [{ name: "index.ts", text: `import { nothing } from "./missing";\nexport const register = (): void => { void nothing; };\n` }] },
];

describe("the plugin type check in Node and in Monaco", () => {
  it("gives the same problems with Monaco's worker, Monaco's TypeScript and the editor's TypeScript", async () => {
    const worker = await checkWithMonacoWorker(SOURCES);
    const monaco = checkWithMonacoTypeScript(SOURCES);
    const node = checkWithNodeTypeScript(SOURCES);
    expect(problemLines(monaco)).toEqual(problemLines(worker));
    expect(problemLines(node)).toEqual(problemLines(worker));
    // The verdicts themselves: the good plugin passes, each bad one fails where it is wrong
    expect(worker.filter(p => p.plugin === "aquarium")).toEqual([]);
    expect(worker.filter(p => p.plugin === "wrong").map(p => p.line)).toEqual([3, 4]);
    expect(worker.some(p => p.plugin === "broken")).toBe(true);
    expect(worker.filter(p => p.plugin === "several")).toEqual([
      { plugin: "several", file: "tint.ts", line: 2, message: "Type 'number' is not assignable to type 'string'." },
    ]);
    expect(worker.filter(p => p.plugin === "lost").map(p => p.message)).toEqual([expect.stringContaining("'./missing'")]);
  });

  it("checks the browser against the same three.js declarations as Node", () => {
    const browser = Object.keys(threeTypesByPath()).sort();
    const node = checkLibs().filter(lib => lib.filePath.startsWith(THREE_TYPES_PATH)).map(lib => lib.filePath.slice(THREE_TYPES_PATH.length)).sort();
    expect(browser.length).toBeGreaterThan(100);
    expect(browser).toEqual(node);
  });

  it("passes every plugin of the test content and the demo (CI: a change of the plugin API's types that breaks one fails here)", () => {
    for (const folder of ["fixtures/content/plugins", "fixtures/demo/plugins"]) {
      const plugins = folderPlugins(resolve(repoRoot, folder));
      expect(plugins.length, folder).toBeGreaterThan(0);
      expect(problemLines(checkWithMonacoTypeScript(plugins)), `${folder}: type errors against plugin-api.d.ts`).toEqual([]);
    }
  });
});
