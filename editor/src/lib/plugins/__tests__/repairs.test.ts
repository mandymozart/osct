// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installedPlugins, installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import { MADE_CODE_BUILD, repairFor, verifiedRepair } from "@shared/plugins/repairs";
import type { PluginSources } from "@shared/plugins/type-check";
import { nodeTypeCode } from "../make-code";
import { checkWithMonacoTypeScript, repoRoot } from "./node-check";

// The type check builds a TypeScript program with three's declarations: seconds on a busy machine
vi.setConfig({ testTimeout: 30_000 });

/** Known faults (#366): Make it code's wrapper before 6.17.1, found by its fingerprint and repaired only when the check agrees */

const AQUARIUM = readFileSync(resolve(repoRoot, "fixtures/demo/plugins/aquarium/index.ts"), "utf8");

/** Code made from a plugin's node type as Make it code wrote it before 6.17.1: `}, build);` and no comment about it */
const beforeFix = (source: string): string => source.replace(/\n *\/\/ `build as never`[^\n]*\n[^\n]*\n/, "\n").replace("}, build as never);", "}, build);");

/** The aquarium made code, and the video node of a made-code plugin made code again (staging's my-my-video-code-code) */
const made = () => {
  installPlugin("aquarium", { register: api => api.registerNodeType("aquarium", { description: "A tank.", params: {} }, ({ three }) => ({ object: new three.Group() })) });
  installPlugin("my-video-code", { register: api => api.registerNodeType("myVideoCode", { description: "A video.", src: "video", params: {} }, ({ three }) => ({ object: new three.Group() })) });
  const video = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  api.registerNodeType("myVideoCode", { description: "A video.", src: "video", params: {} }, ({ three }) => ({ object: new three.Group() }));
};
`;
  return {
    aquarium: nodeTypeCode({ type: "aquarium", assets: [] }, { plugins: installedPlugins() }, { plugin: "aquarium", source: AQUARIUM }),
    video: nodeTypeCode({ type: "myVideoCode", assets: [] }, { plugins: installedPlugins(), types: ["myVideoCode"] }, { plugin: "my-video-code", source: video }),
  };
};

const one = (id: string, text: string, more: PluginSources["files"] = []): PluginSources => ({ id, files: [{ name: "index.ts", text }, ...more] });

afterEach(() => installedPlugins().forEach(uninstallPlugin));

describe("the known fault of Make it code before 6.17.1", () => {
  it("is refused by the type check, found by its fingerprint, and repaired to what Make it code writes now", async () => {
    for (const code of Object.values(made())) {
      const old = one(code.plugin, beforeFix(code.source));
      const problems = checkWithMonacoTypeScript([old]);
      expect(problems).toHaveLength(1);
      expect(MADE_CODE_BUILD.gives(problems[0], old.files[0].text)).toBe(true);
      const repair = await verifiedRepair(old, problems, checkWithMonacoTypeScript);
      expect(repair?.fault.id).toBe("made-code-build");
      expect(repair?.changed).toEqual(["index.ts"]);
      expect(repair?.remaining).toEqual([]);
      // The one change: `build` → `build as never`
      expect(repair?.files[0].text).toBe(old.files[0].text.replace("}, build);", "}, build as never);"));
      expect(checkWithMonacoTypeScript([{ id: code.plugin, files: repair!.files }])).toEqual([]);
    }
  });

  it("leaves the plugin's other errors to the person: repaired, they remain", async () => {
    const { aquarium } = made();
    const old = one(aquarium.plugin, beforeFix(aquarium.source), [{ name: "extra.ts", text: "export const n: number = \"one\";\n" }]);
    const problems = checkWithMonacoTypeScript([old]);
    const repair = await verifiedRepair(old, problems, checkWithMonacoTypeScript);
    expect(repair?.changed).toEqual(["index.ts"]);
    expect(repair?.remaining.map(p => p.file)).toEqual(["extra.ts"]);
  });

  it("offers nothing when the fingerprint is not exact or the error is another one", async () => {
    const { aquarium } = made();
    const old = beforeFix(aquarium.source);
    // Re-indented by hand: the text Make it code wrote is not there any more
    const edited = one(aquarium.plugin, old.replace("    registerNodeType: (copiedType, _spec, build) => {", "  registerNodeType: (copiedType, _spec, build) => {"));
    expect(repairFor(edited, checkWithMonacoTypeScript([edited]))).toBeNull();
    // Not made with Make it code: the header is missing
    const own = one(aquarium.plugin, old.replace('Made with "make it code"', "Written"));
    expect(repairFor(own, checkWithMonacoTypeScript([own]))).toBeNull();
    // Made code that type-checks has nothing to repair; a plain type error is no known fault
    expect(repairFor(one(aquarium.plugin, aquarium.source), [])).toBeNull();
    const wrong = one("wrong", "export const n: number = \"one\";\n");
    expect(await verifiedRepair(wrong, checkWithMonacoTypeScript([wrong]), checkWithMonacoTypeScript)).toBeNull();
  });

  it("is never offered when the repaired files still fail for the fault", async () => {
    const { aquarium } = made();
    const old = one(aquarium.plugin, beforeFix(aquarium.source));
    const problems = checkWithMonacoTypeScript([old]);
    const stubborn = { ...MADE_CODE_BUILD, fix: (text: string) => text };
    expect(await verifiedRepair(old, problems, checkWithMonacoTypeScript, [stubborn])).toBeNull();
  });
});
