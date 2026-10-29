import { describe, expect, it } from "vitest";
import { registerCodeTools } from "../src/code.ts";
import { fakeFetch, recorder, type Seen } from "./helpers.ts";

const LINKS = { editor: "http://localhost:5175/editor" };
const SOURCE = `import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => {\n  api.registerLayer("tint", { description: "t", nodeTypes: ["video"], params: {} }, { glsl: "return rgba;" });\n};\n`;

function pluginsApi(seen: Seen) {
  const { method, path } = seen;
  if (path === "/editor/books/osct/plugins") return { json: { plugins: [{ id: "tint", size: SOURCE.length, updatedAt: "t", updatedBy: "a@b" }] } };
  if (method === "GET" && path === "/editor/books/osct/plugins/tint") return { json: { plugin: { id: "tint", source: SOURCE, size: SOURCE.length, updatedAt: "t", updatedBy: "a@b" } } };
  if (method === "PUT" && path.startsWith("/editor/books/osct/plugins/")) {
    const source = (seen.body as any).source as string;
    return { json: { plugin: { id: path.split("/").pop(), size: source.length, updatedAt: "t", updatedBy: "a@b" } } };
  }
  if (method === "DELETE" && path === "/editor/books/osct/plugins/tint") return { status: 204 };
  return undefined;
}

describe("the Code tab's plugin tools", () => {
  const setup = () => {
    const fake = fakeFetch(pluginsApi);
    const rec = recorder();
    registerCodeTools(rec.server, fake.api(), LINKS);
    return { rec, seen: fake.seen };
  };

  it("lists and reads a source with the types it registers", async () => {
    const { rec } = setup();
    expect((await rec.call("list_plugins", { book: "osct" })).data.plugins[0].id).toBe("tint");
    const one = await rec.call("get_plugin", { book: "osct", plugin: "tint" });
    expect(one.data.plugin.source).toBe(SOURCE);
    expect(one.data.registers).toEqual({ components: [], layers: ["tint"] });
  });

  it("saves a source and names what it registers, with warnings for a source the engine would refuse", async () => {
    const { rec, seen } = setup();
    const saved = await rec.call("put_plugin", { book: "osct", plugin: "tint", source: SOURCE });
    expect(saved.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/books/osct/plugins/tint", body: { source: SOURCE } });
    expect(saved.data.registers.layers).toEqual(["tint"]);
    expect(saved.data.warnings).toBeUndefined();
    expect(saved.data.open).toBe("http://localhost:5175/editor/osct/");
    const odd = await rec.call("put_plugin", { book: "osct", plugin: "odd", source: 'import * as THREE from "three";\nconst x = 1;\n' });
    expect(odd.ok).toBe(true);
    expect(odd.data.warnings).toEqual([expect.stringContaining("register(api)"), expect.stringContaining("imports a module"), expect.stringContaining("no registerComponent")]);
  });

  it("refuses an id the API would refuse before sending, deletes → deleted", async () => {
    const { rec, seen } = setup();
    await expect(rec.call("put_plugin", { book: "osct", plugin: "Tint", source: SOURCE })).rejects.toThrow();
    expect(seen).toHaveLength(0);
    expect((await rec.call("delete_plugin", { book: "osct", plugin: "tint" })).data).toEqual({ deleted: "tint" });
  });
});
