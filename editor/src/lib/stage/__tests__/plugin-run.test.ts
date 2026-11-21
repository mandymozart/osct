import { afterEach, describe, expect, it, vi } from "vitest";
import { componentSpec } from "@engine/types";
import { installedPlugins, uninstallPlugin } from "@engine/scene/plugins";
import { runPluginCode } from "../plugin-run";

/** The stage frame's half of Run (#234): the transpiled module imported and installed there, the answer as data */

const blobs = new Map<string, Blob>();
const importer = async (url: string): Promise<unknown> => {
  const code = await blobs.get(url)!.text();
  return { register: new Function(`${code.replace(/^export const register =/m, "const register =")}\nreturn register;`)() };
};

const SPIN = `export const register = api => api.registerComponent("spin", { description: "Spins.", params: {} }, () => ({}));`;

afterEach(() => {
  installedPlugins().forEach(uninstallPlugin);
  vi.restoreAllMocks();
});

describe("runPluginCode", () => {
  it("installs the module and answers the types it registered", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { const url = `blob:test/${blobs.size}`; blobs.set(url, blob as Blob); return url; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    expect(await runPluginCode("fx", SPIN, importer)).toEqual({ ok: true, types: ["spin"] });
    expect(componentSpec("spin")?.description).toBe("Spins.");
  });

  it("answers why it did not run: the module did not load, register refused or threw", async () => {
    expect(await runPluginCode("fx", SPIN, () => Promise.reject(new Error("blocked")))).toEqual({ ok: false, error: "The module did not load – blocked" });
    expect(await runPluginCode("fx", "", async () => ({}))).toEqual({ ok: false, error: "fx: the module exports no register(api) function" });
    const thrown = await runPluginCode("fx", "", async () => ({ register: () => { throw new Error("boom"); } }));
    expect(thrown).toEqual({ ok: false, error: "fx: register failed – boom" });
  });
});
