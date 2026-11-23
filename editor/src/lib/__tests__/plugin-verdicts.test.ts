import { afterEach, describe, expect, it, vi } from "vitest";
import { installedPlugins, installPlugin, uninstallPlugin } from "@engine/scene/plugins";
import { nodeTypeCode } from "#lib/plugins/make-code.js";
import { checkWithMonacoTypeScript } from "#lib/plugins/__tests__/node-check.js";

/**
 * The saved plugins' verdicts (#366): the Code tab's check of the saved files marks the ones that will not publish, and
 * **Repair** saves a known fault's repair as a normal save – only of the files it checked
 */

const OWNER = `import type { PluginApi } from "osct-plugin-api";
export const register = (api: PluginApi): void => {
  api.registerNodeType("aquarium", { description: "A tank.", params: {} }, ({ three }) => ({ object: new three.Group() }));
};
`;

/** Code made from a plugin's node type as Make it code wrote it before 6.17.1 */
const madeBefore = (): string => {
  installPlugin("aquarium", { register: api => api.registerNodeType("aquarium", { description: "A tank.", params: {} }, ({ three }) => ({ object: new three.Group() })) });
  const made = nodeTypeCode({ type: "aquarium", assets: [] }, { plugins: installedPlugins() }, { plugin: "aquarium", source: OWNER });
  return made.source.replace(/\n *\/\/ `build as never`[^\n]*\n[^\n]*\n/, "\n").replace("}, build as never);", "}, build);");
};

const SAVED: Record<string, string> = {};
const puts: Array<{ id: string; files: Array<{ name: string; text: string }> }> = [];
let saves = 0;

vi.mock("../api", async original => ({
  ...(await original<typeof import("../api")>()),
  listPlugins: async () => ({ plugins: Object.keys(SAVED).sort().map(id => ({ id, size: SAVED[id].length, fileCount: 1, origin: null, usages: 0, updatedAt: `t${saves}`, updatedBy: null })) }),
  getPlugin: async (_experience: string, id: string) => ({ plugin: { id, files: [{ name: "index.ts", text: SAVED[id] }], size: 1, updatedAt: `t${saves}`, updatedBy: null, origin: null } }),
  putPlugin: async (_experience: string, id: string, files: Array<{ name: string; text: string }>) => {
    puts.push({ id, files });
    SAVED[id] = files[0].text;
    saves += 1;
    return { plugin: { id, files, size: 1, updatedAt: `t${saves}`, updatedBy: null, origin: null } };
  },
}));
vi.mock("../library.svelte", () => ({ library: { refresh: async () => undefined } }));
// The browser's check is Monaco's worker; here the same check with Monaco's TypeScript in Node (type-check.test.ts holds them to one verdict)
vi.mock("#lib/plugins/monaco.js", () => ({ typeCheckPlugins: async (sources: Parameters<typeof checkWithMonacoTypeScript>[0]) => checkWithMonacoTypeScript(sources) }));

const { plugins } = await import("../plugins.svelte");

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  for (const id of Object.keys(SAVED)) delete SAVED[id];
  puts.length = 0;
});

describe("the saved plugins' verdicts", () => {
  it("marks the plugin that will not publish, offers the known repair, and Repair saves it as a normal save", async () => {
    SAVED["my-aquarium-code"] = madeBefore();
    SAVED.fine = `import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => { api.log("fine"); };\n`;
    const experience = "verdicts-1";
    await plugins.load(experience);
    plugins.checkSaved(experience);
    await vi.waitFor(() => expect(plugins.verdicts.size).toBe(2), { timeout: 10_000 });
    expect([...plugins.typeErrorIds()]).toEqual(["my-aquarium-code"]);
    expect(plugins.verdicts.get("my-aquarium-code")?.repair?.fault.id).toBe("made-code-build");
    expect(plugins.verdicts.get("fine")?.problems).toEqual([]);

    const after = await plugins.repair(experience, "my-aquarium-code");
    expect(puts).toHaveLength(1);
    expect(puts[0].files[0].text).toContain("}, build as never);");
    expect(after?.problems).toEqual([]);
    expect(plugins.typeErrorIds().size).toBe(0);
  }, 20_000);

  it("saves nothing when the saved files changed since the check – it checks them again", async () => {
    SAVED["my-aquarium-code"] = madeBefore();
    const experience = "verdicts-2";
    await plugins.load(experience);
    plugins.checkSaved(experience);
    await vi.waitFor(() => expect(plugins.verdicts.get("my-aquarium-code")?.repair).toBeTruthy(), { timeout: 10_000 });
    // Someone fixed it by hand in the meantime: a different text, another verdict
    SAVED["my-aquarium-code"] = SAVED["my-aquarium-code"].replace("}, build);", "}, build as never);");
    const after = await plugins.repair(experience, "my-aquarium-code");
    expect(puts).toEqual([]);
    expect(after?.problems).toEqual([]);
  }, 20_000);
});
