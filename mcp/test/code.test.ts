import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerCodeTools } from "../src/code.ts";
import { fakeFetch, recorder, type Seen } from "./helpers.ts";

const LINKS = { editor: "http://localhost:5175/editor" };
const SOURCE = `import type { PluginApi } from "osct-plugin-api";\nexport const register = (api: PluginApi): void => {\n  api.registerLayer("tint", { description: "t", nodeTypes: ["video"], params: {} }, { glsl: "return rgba;" });\n};\n`;

function pluginsApi(seen: Seen) {
  const { method, path } = seen;
  if (method === "GET" && path === "/editor/books/osct/plugins") return { json: { plugins: [{ id: "tint", size: SOURCE.length, updatedAt: "t", updatedBy: "a@b" }] } };
  if (method === "GET" && path === "/editor/books/osct/plugins/tint") return { json: { plugin: { id: "tint", source: SOURCE, size: SOURCE.length, updatedAt: "t", updatedBy: "a@b" } } };
  if (method === "PUT" && path.startsWith("/editor/books/osct/plugins/") && !path.endsWith("/file")) {
    const source = (seen.body as any).source as string;
    return { json: { plugin: { id: path.split("/").pop(), size: source.length, updatedAt: "t", updatedBy: "a@b" } } };
  }
  if (method === "DELETE" && path === "/editor/books/osct/plugins/tint") return { status: 204 };
  if (method === "DELETE" && path === "/editor/books/osct/plugins/used") return { status: 409, json: { error: { code: "plugin-in-use", message: "in use", usages: [{ kind: "entity", ref: "castle" }] } } };
  if (method === "DELETE" && path === "/editor/books/osct/plugins/used?force=1") return { status: 204 };
  if (method === "GET" && path === "/editor/books/osct/plugins/tint/usages") return { json: { usages: [{ kind: "entity", ref: "castle" }], registers: { layers: ["tint"] } } };
  if ((method === "POST" && path.startsWith("/editor/books/osct/plugins")) || (method === "PUT" && path.endsWith("/file"))) {
    const id = path.includes("?id=") ? path.split("?id=")[1] : method === "PUT" ? path.split("/")[5] : "wobble-effect";
    return { status: method === "POST" ? 201 : 200, json: { plugin: { id, source: SOURCE, size: SOURCE.length, updatedAt: "t", updatedBy: "a@b" } } };
  }
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
    expect(one.data.registers).toEqual({ components: [], layers: ["tint"], nodeTypes: [], passes: [], materials: [], textures: [] });
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

  it("uploads a script file as a new source or a replacement (#186)", async () => {
    const { rec, seen } = setup();
    const file = join(mkdtempSync(join(tmpdir(), "osct-mcp-")), "Wobble Effect.ts");
    writeFileSync(file, SOURCE);
    const made = await rec.call("upload_plugin", { book: "osct", file });
    expect(made.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/editor/books/osct/plugins", headers: { "X-File-Name": "Wobble Effect.ts" } });
    expect(made.data.plugin).toMatchObject({ id: "wobble-effect" });
    expect(made.data.plugin.source).toBeUndefined();
    expect(made.data.registers.layers).toEqual(["tint"]);
    await rec.call("upload_plugin", { book: "osct", file, plugin: "tint" });
    expect(seen[1]).toMatchObject({ method: "POST", path: "/editor/books/osct/plugins?id=tint" });
    const replaced = await rec.call("upload_plugin", { book: "osct", file, plugin: "tint", replace: true });
    expect(seen[2]).toMatchObject({ method: "PUT", path: "/editor/books/osct/plugins/tint/file" });
    expect(replaced.data.plugin.id).toBe("tint");
    const lost = await rec.call("upload_plugin", { book: "osct", file, replace: true });
    expect(lost.ok).toBe(false);
    expect(seen).toHaveLength(3);
  });

  it("says where a source is used, and a delete while used asks for force", async () => {
    const { rec, seen } = setup();
    const used = await rec.call("plugin_usages", { book: "osct", plugin: "tint" });
    expect(used.data.usages).toEqual([{ kind: "entity", ref: "castle" }]);
    const refused = await rec.call("delete_plugin", { book: "osct", plugin: "used" });
    expect(refused.ok).toBe(false);
    expect(refused.data.error).toMatchObject({ code: "plugin-in-use", usages: [{ kind: "entity", ref: "castle" }], hint: expect.stringContaining("force: true") });
    expect((await rec.call("delete_plugin", { book: "osct", plugin: "used", force: true })).data).toEqual({ deleted: "used" });
    expect(seen.at(-1)?.path).toBe("/editor/books/osct/plugins/used?force=1");
  });
});
