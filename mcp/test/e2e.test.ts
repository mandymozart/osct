// End to end: the real API (PHP's built-in server on a free port, a fresh SQLite, mails to a log – as
// server/tests/api-test.php does) and the real MCP server over stdio, driven like Claude Code drives it: sign in through
// the mail log, import a small configuration, edit an entity, add a target, upload a file, write a plugin source,
// publish to local. Skipped with a message when php is not on the path.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "../src/config.ts";
import { assertGameConfiguration } from "../../shared/guards/game-config";

const php = spawnSync("php", ["--version"], { encoding: "utf8" });
const hasPhp = php.status === 0;
if (!hasPhp) console.warn("e2e: php is not on the path – the end-to-end test against the API is skipped (install PHP 8.1+ with pdo_sqlite to run it)");

const freePort = () =>
  new Promise<number>((done, fail) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => done(port));
    });
    server.on("error", fail);
  });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** the code of the last mail in the log (the API writes `=== <date> ===` before every mail; the code stands indented on its own line) */
function lastCode(log: string): string | null {
  const mails = readFileSync(log, "utf8").split("=== ");
  const match = /^ {4}(\d{6})\r?$/m.exec(mails[mails.length - 1]);
  return match ? match[1] : null;
}

const PLACE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
/** A small 3.0 configuration: a cover and a double page, one surface each */
const CONFIGURATION = {
  version: { version: "1.0.0", timestamp: "2026-10-29T00:00:00Z", hash: "ab".repeat(32), schema: "3.0" },
  book: { id: "osct", title: "Test Book", author: "Someone" },
  initialScene: "s1",
  scenes: [
    { id: "s1", label: "Cover", surfaces: [{ id: "surface", label: "Cover", widthMm: 230, heightMm: 320, place: PLACE }] },
    { id: "studio-b", label: "30–31", surfaces: [{ id: "surface", label: "30–31", widthMm: 460, heightMm: 320, place: PLACE }] },
  ],
  entries: [
    { id: "racoon", category: "glossary", title: "Racoon", scene: "s1", body: "", tags: [], target: { id: "racoon", imageSrc: "/assets/content/entries/racoon/img.jpg", place: { x: 40, y: 60, width: 80 }, entity: { type: "model", assets: [{ id: "racoon-0", assetType: "glb", src: "/assets/content/entries/racoon/racoon.glb" }], params: { scale: 0.5 } } } },
    { id: "castle", category: "video", title: "Castle", scene: "studio-b", body: "", tags: [], target: { id: "castle-target", imageSrc: "/assets/content/entries/castle/img.jpg", entity: { ref: "castle" } } },
  ],
  entities: { castle: { type: "video", assets: [{ id: "castle-0", assetType: "video", src: "/assets/content/entities/castle/c.mp4" }], params: {}, filters: [{ type: "chromaKey", color: "#00ff00" }] } },
  plugins: [{ id: "tint", src: "/assets/content/plugins/tint/plugin.js", api: "1.0" }],
};
// The test's own configuration is valid content: the shipped guard passes it
assertGameConfiguration(CONFIGURATION, { unknownComponentTypes: "allow" });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!hasPhp)("end to end: the MCP server over stdio against the PHP API", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osct-mcp-e2e-"));
  const mailLog = join(tmp, "mail.log");
  const storeDir = join(tmp, "content");
  let apiProcess: ChildProcess;
  let api: string;
  let client: Client;
  const names = async () => (await client.listTools()).tools.map(t => t.name).sort();
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean };
    const raw = result.content.map(c => c.text ?? "").join("");
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // plain text
    }
    return { ok: !result.isError, data };
  };
  /** A removal in its two steps (#198): the impact (nothing removed), then the same call with the confirmation */
  const remove = async (name: "delete_scene" | "delete_entry", args: Record<string, unknown>, via = call) => {
    const first = await via(name, args);
    expect(first.ok, JSON.stringify(first.data)).toBe(true);
    expect(first.data).toMatchObject({ deleted: false, impact: expect.any(Object), confirmation: { id: expect.stringMatching(/^\d{10}\.[0-9a-f]{32}$/) } });
    return { first, second: await via(name, { ...args, confirm: first.data.confirmation.id }) };
  };

  beforeAll(async () => {
    const port = await freePort();
    api = `http://127.0.0.1:${port}/api`;
    const settings: Record<string, string> = {
      DB_SQLITE_PATH: join(tmp, "test.sqlite"),
      SECRET: "s".repeat(40),
      MAIL_TRANSPORT: "log",
      MAIL_LOG_PATH: mailLog,
      EDITORS: "editor@example.test",
      APP_URL: "https://app.example",
      ALLOWED_ORIGINS: "http://localhost:5175",
      CONTENT_STORE_DIR: storeDir,
      LOG_PATH: join(tmp, "error.log"),
      CONFIG_FILE: "/nonexistent",
    };
    const env = { ...process.env, ...Object.fromEntries(Object.entries(settings).map(([k, v]) => [`OSCT_${k}`, v])) };
    const serverDir = resolve(ROOT, "server");
    apiProcess = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", serverDir, resolve(serverDir, "api/index.php")], { cwd: serverDir, env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    apiProcess.stderr?.on("data", chunk => (stderr += String(chunk)));
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      await sleep(100);
      up = await fetch(`${api}/health`).then(r => r.ok, () => false);
    }
    if (!up) throw new Error(`the API did not start on ${api}: ${stderr}`);

    client = new Client({ name: "osct-mcp-e2e", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(ROOT, "mcp/bin/osct-mcp.mjs")],
      env: { ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === "string")) as Record<string, string>), OSCT_API_URL: api, OSCT_EDITOR_URL: "http://localhost:5175/editor", OSCT_EDITOR_TOKEN: "" },
      stderr: "pipe",
      cwd: ROOT,
    });
    await client.connect(transport);
  }, 60000);

  afterAll(async () => {
    await client?.close().catch(() => undefined);
    apiProcess?.kill();
    await sleep(200);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("starts without a token: whoami and the sign-in pair, nothing else", async () => {
    expect(await names()).toEqual(["sign_in_request", "sign_in_verify", "whoami"]);
    const who = await call("whoami");
    expect(who.ok).toBe(true);
    expect(who.data.user).toBeNull();
    expect(who.data.api).toContain("(local dev)");
  });

  it("signs in through the mail log; the editor's tools, prompts and rules open", async () => {
    const request = await call("sign_in_request", { email: "editor@example.test" });
    expect(request.ok).toBe(true);
    expect(existsSync(mailLog)).toBe(true);
    const code = lastCode(mailLog);
    expect(code).toMatch(/^\d{6}$/);
    const wrong = await call("sign_in_verify", { requestId: request.data.requestId, code: code === "000000" ? "111111" : "000000" });
    expect(wrong.ok).toBe(false);
    expect(wrong.data.error.code).toBe("invalid-code");
    const verified = await call("sign_in_verify", { requestId: request.data.requestId, code: code! });
    expect(verified.ok, JSON.stringify(verified.data)).toBe(true);
    expect(verified.data.user).toEqual({ email: "editor@example.test", roles: ["reader", "editor"] });
    expect(await names()).toEqual(
      expect.arrayContaining(["list_books", "preview_import", "import_book", "get_book", "get_scene", "get_entity", "put_entity", "put_target", "add_entry", "delete_entry", "list_scenes", "add_scene", "put_scene", "move_scenes", "delete_scene", "migrate_3", "put_book_passes", "put_book_appearance", "put_environment", "list_assets", "upload_asset", "delete_asset", "list_plugins", "get_plugin", "put_plugin", "delete_plugin", "get_draft", "publish", "list_versions", "list_changes", "describe_content_model"]),
    );
    expect((await names()).filter(name => /spread|page|matter/.test(name))).toEqual([]);
    expect((await client.listPrompts()).prompts.map(p => p.name).sort()).toEqual(["add-target", "editor"]);
    const resource = await client.readResource({ uri: "osct://rules/content-model" });
    expect(JSON.parse((resource.contents[0] as { text: string }).text).entity.nodeTypes).toContain("video");
    const who = await call("whoami");
    expect(who.data.services).toEqual({ editor: true, admin: false });
  });

  it("imports a 3.0 configuration and reads the tree and a scene", async () => {
    expect((await call("list_books")).data.books).toEqual([]);
    const imported = await call("import_book", { book: "osct", configuration: CONFIGURATION, assetsBase: "http://localhost:5174" });
    expect(imported.ok).toBe(true);
    expect(imported.ok, JSON.stringify(imported.data)).toBe(true);
    expect(imported.data.counts).toEqual({ scenes: 2, entries: 2, targets: 2, entities: 1 });
    const book = await call("get_book", { book: "osct" });
    expect(book.data.counts).toEqual({ scenes: 2, entries: 2, targets: 2 });
    expect(book.data.book).toMatchObject({ initialScene: "s1", scenes: 2 });
    expect(book.data.scenes.map((s: any) => [s.id, s.label])).toEqual([["s1", "Cover"], ["studio-b", "30–31"]]);
    const scene = await call("get_scene", { book: "osct", scene: "studio-b" });
    expect(scene.data.scene).toMatchObject({ id: "studio-b", label: "30–31", surfaces: [{ id: "surface", widthMm: 460, heightMm: 320, place: PLACE }] });
    expect(scene.data.entries[0]).toMatchObject({ id: "castle", scene: "studio-b" });
    expect(scene.data.entries[0].target.ref).toBe("castle");
    expect(scene.data.entries[0].target.entity.filters[0].type).toBe("chromaKey");
    expect(scene.data.open).toBe("http://localhost:5175/editor/osct/studio-b/");
    // A 2.x configuration is no import any more
    const old = await call("preview_import", { configuration: { ...CONFIGURATION, version: { ...CONFIGURATION.version, schema: "2.36" } } });
    expect(old.ok).toBe(false);
    expect(old.data.error).toMatchObject({ status: 400, code: "invalid-configuration" });
  });

  it("re-imports in two steps: the comparison and a confirmation first, nothing replaced; then with confirm (#183)", async () => {
    const args = { book: "osct", configuration: CONFIGURATION, assetsBase: "http://localhost:5174" };
    const preview = await call("preview_import", { configuration: CONFIGURATION, assetsBase: "http://localhost:5174" });
    expect(preview.ok, JSON.stringify(preview.data)).toBe(true);
    expect(preview.data).toMatchObject({ imported: false, incoming: { book: "osct", title: "Test Book", build: "abababababab" }, counts: { scenes: 2, entries: 2, targets: 2, entities: 1 }, existing: { book: { id: "osct" }, draft: { edits: 0 } } });
    const first = await call("import_book", args);
    expect(first.ok).toBe(true);
    expect(first.data.imported).toBe(false);
    expect(first.data.comparison).toMatchObject({ book: { id: "osct", title: "Test Book" }, incoming: { build: "abababababab", appVersion: "1.0.0", schema: "3.0" }, draft: { basedOn: { build: "abababababab", importedBy: "editor@example.test" }, edits: 0 }, same: true });
    expect(first.data.confirmation.id).toMatch(/^[0-9]{10}[.][0-9a-f]{32}$/);
    const second = await call("import_book", { ...args, confirm: first.data.confirmation.id });
    expect(second.ok).toBe(true);
    expect(second.data.counts).toEqual({ scenes: 2, entries: 2, targets: 2, entities: 1 });
    expect(second.data.imported).toMatchObject({ build: "abababababab", importedBy: "editor@example.test" });
  });

  it("edits the shared entity: a bad body never reaches the API, a good one is the draft", async () => {
    const bad = await call("put_entity", { book: "osct", ref: "castle", entity: { type: "video", assets: [], params: { scale: "big" } } });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.problems[0]).toMatch(/^entity\.params\.scale/);
    const castle = (await call("get_entity", { book: "osct", ref: "castle" })).data.entity;
    const edited = await call("put_entity", { book: "osct", ref: "castle", entity: { ...castle, params: { scale: 2, rotation: [90, 0, 0] }, components: [{ type: "tint", opacity: 0.4 }] } });
    expect(edited.ok).toBe(true);
    expect(edited.data.entity.params.scale).toBe(2);
    expect(edited.data.warnings[0]).toContain("tint");
    const draft = await call("get_draft", { book: "osct" });
    expect(draft.data.configuration.entities.castle.params.scale).toBe(2);
    expect(draft.data.configuration.entities.castle.assets[0].src).toBe("http://localhost:5174/assets/content/entities/castle/c.mp4");
  });

  it("uploads a file and adds a target with it on the scene 30–31, then changes its place", async () => {
    const file = join(tmp, "dot.png");
    writeFileSync(file, PNG);
    const uploaded = await call("upload_asset", { book: "osct", file });
    expect(uploaded.ok).toBe(true);
    expect(uploaded.data.asset.kind).toBe("image");
    expect(uploaded.data.asset.url).toContain("/content/assets/osct/");
    const url: string = uploaded.data.asset.url;
    const added = await call("add_entry", {
      book: "osct",
      title: "Shadows",
      id: "shadows",
      scene: "studio-b",
      surface: "surface",
      category: "video",
      target: { imageSrc: url, place: { surface: "surface", x: 270, y: 60, width: 80 }, entity: { type: "video", assets: [{ id: "shadows", assetType: "video", src: url }], params: { rotation: [90, 0, 0], position: [0, 0, 0.3] }, components: [{ type: "tint", color: "#f3cc94" }] } },
    });
    expect(added.ok, JSON.stringify(added.data)).toBe(true);
    expect(added.data.entry).toMatchObject({ id: "shadows", scene: "studio-b", surface: "surface" });
    expect(added.data.scene).toBe("studio-b");
    expect(added.data.open).toBe("http://localhost:5175/editor/osct/studio-b/");
    const moved = await call("put_target", { book: "osct", target: "shadows", place: { surface: "surface", x: 280, y: 60, width: 90 } });
    expect(moved.ok, JSON.stringify(moved.data)).toBe(true);
    expect(moved.data.target.place).toEqual({ surface: "surface", x: 280, y: 60, width: 90 });
    expect(moved.data.open).toBe("http://localhost:5175/editor/osct/studio-b/");
    const scene = await call("get_scene", { book: "osct", scene: "studio-b" });
    expect(scene.data.entries.map((e: any) => e.id)).toEqual(["castle", "shadows"]);
    const assets = await call("list_assets", { book: "osct", kind: "image" });
    expect(assets.data.assets[0].usages).toBeGreaterThan(0);
    const inUse = await call("delete_asset", { book: "osct", asset: uploaded.data.asset.id });
    expect(inUse.ok).toBe(false);
    expect(inUse.data.error.code).toBe("asset-in-use");
  });

  it("writes the entry's text and the book's texts through the API (#223)", async () => {
    const edited = await call("update_entry", { book: "osct", entry: "shadows", body: "The **shadows** move – {hasKey: you have the key|find the key}.", tags: ["dark"], media: "https://example.org/shadows" });
    expect(edited.ok).toBe(true);
    expect(edited.data.entry.tags).toEqual(["dark"]);
    const entries = await call("get_entries", { book: "osct", search: "shadows" });
    expect(entries.data.entries.find((e: { id: string }) => e.id === "shadows").body).toContain("{hasKey:");
    const refused = await call("update_entry", { book: "osct", entry: "shadows", image: "https://evil.example/x.jpg" });
    expect(refused.data.error.code).toBe("invalid-entry");
    const book = await call("update_book", { book: "osct", publisher: "Building Fictions" });
    expect(book.data.book.publisher).toBe("Building Fictions");
  });

  it("writes a plugin source and sees it in the model", async () => {
    const source = `export const register = (api) => {\n  api.registerLayer("glow", { description: "Glows.", nodeTypes: ["video"], params: {} }, { glsl: "return rgba;" });\n};\n`;
    const saved = await call("put_plugin", { book: "osct", plugin: "glow", source });
    expect(saved.ok).toBe(true);
    expect(saved.data.registers).toEqual({ components: [], layers: ["glow"], nodeTypes: [], passes: [], materials: [], textures: [], appearances: [] });
    expect(saved.data.plugin.updatedBy).toBe("editor@example.test");
    const read = await call("get_plugin", { book: "osct", plugin: "glow" });
    expect(read.data.plugin.source).toBe(source);
    const model = await call("describe_content_model", { book: "osct" });
    expect(model.data.components.declaredPlugins[0].id).toBe("tint");
    expect(model.data.components.codeTabSources).toEqual([{ id: "glow", components: [], layers: ["glow"], nodeTypes: [], passes: [], materials: [], textures: [], appearances: [] }]);
    expect((await call("list_plugins", { book: "osct" })).data.plugins).toHaveLength(1);
  });

  it("publishes to local (the file lands in the store), refuses production, and the logs tell", async () => {
    const published = await call("publish", { book: "osct", env: "local", note: "from the MCP" });
    expect(published.ok).toBe(true);
    expect(published.data.build).toMatch(/^[0-9a-f]{12}$/);
    expect(existsSync(join(storeDir, "local", published.data.build, "game.config.json"))).toBe(true);
    expect(published.data).toMatchObject({ env: "local", store: "server", warning: expect.stringContaining("No CDN connected") });
    const staging = await call("publish", { book: "osct", env: "staging" });
    expect(staging.data.error).toMatchObject({ status: 403, code: "other-environment", env: "local" });
    const production = await call("publish", { book: "osct", env: "production" });
    expect(production.ok).toBe(false);
    expect(production.data.error.code).toBe("production-is-a-person");
    const versions = await call("list_versions", { book: "osct" });
    expect(versions.data.versions[0]).toMatchObject({ env: "local", note: "from the MCP", publishedBy: "editor@example.test" });
    const changes = await call("list_changes", { book: "osct", limit: 10 });
    expect(changes.data.changes.map((c: any) => c.kind)).toEqual(expect.arrayContaining(["entity", "target", "entry", "plugin"]));
    expect((await call("delete_plugin", { book: "osct", plugin: "glow" })).ok).toBe(true);
    // The Library's code files (#186): a shader as an asset, a script file as a plugin source
    const shaderFile = join(tmp, "pulse.frag");
    writeFileSync(shaderFile, "void main() { gl_FragColor = vec4(1.0); }\n");
    const shader = await call("upload_asset", { book: "osct", file: shaderFile });
    expect(shader.data.asset).toMatchObject({ kind: "shader", name: "pulse.frag" });
    const scriptFile = join(tmp, "Wobble.ts");
    writeFileSync(scriptFile, "export const register = (api: any) => api.registerComponent('wobble', { description: 'w', params: {} }, () => ({}));\n");
    const script = await call("upload_plugin", { book: "osct", file: scriptFile });
    expect(script.data.plugin.id).toBe("wobble");
    expect(script.data.registers.components).toEqual(["wobble"]);
    expect((await call("upload_plugin", { book: "osct", file: scriptFile })).data.error.code).toBe("plugin-exists");
    expect((await call("plugin_usages", { book: "osct", plugin: "wobble" })).data.usages).toEqual([]);
    expect((await call("delete_plugin", { book: "osct", plugin: "wobble" })).ok).toBe(true);
    expect((await call("delete_asset", { book: "osct", asset: shader.data.asset.id })).ok).toBe(true);
    const asked = await call("delete_entry", { book: "osct", entry: "shadows" });
    expect(asked.data.impact).toMatchObject({ kind: "entry", entry: { id: "shadows" }, counts: { entries: 1, targets: 1, entities: 1 } });
    expect((await call("get_scene", { book: "osct", scene: "studio-b" })).data.entries).toHaveLength(2);
    const { second } = await remove("delete_entry", { book: "osct", entry: "shadows" });
    expect(second.ok, JSON.stringify(second.data)).toBe(true);
    expect(second.data.deleted).toMatchObject({ entries: ["shadows"], targets: ["shadows"], files: [] });
    expect((await call("get_scene", { book: "osct", scene: "studio-b" })).data.entries).toHaveLength(1);
  });

  it("scenes (3.0): adds from presets, places surfaces, sets passes and the environment, moves, groups, removes – the draft passes the guard", async () => {
    /** The draft as the reader reads it: the shipped guard passes it */
    const readerReads = async () => {
      const draft = (await call("get_draft", { book: "osct" })).data.configuration;
      expect(() => assertGameConfiguration(draft, { unknownComponentTypes: "allow" }), JSON.stringify(draft.scenes)).not.toThrow();
      expect(draft.version.schema).toMatch(/^3\./);
      return draft;
    };
    await readerReads();
    // An imported book is print first – it takes new scenes like a digital-first one
    const double = await call("add_scene", { book: "osct", after: "s1", id: "studio-a", label: "Studio A" });
    expect(double.ok, JSON.stringify(double.data)).toBe(true);
    expect(double.data.scene).toMatchObject({ id: "studio-a", label: "Studio A", surfaces: [{ widthMm: 460, heightMm: 320 }] });
    expect(double.data.position).toBe(1);
    expect(double.data.open).toBe("http://localhost:5175/editor/osct/studio-a/");
    const wall = await call("add_scene", { book: "osct", preset: "wall", id: "wall", label: "The wall" });
    expect(wall.ok, JSON.stringify(wall.data)).toBe(true);
    expect(wall.data.scene.surfaces).toEqual([expect.objectContaining({ widthMm: 2000, heightMm: 1500, place: expect.objectContaining({ rx: 90 }) })]);
    const wallSurface: string = wall.data.scene.surfaces[0].id;
    expect((await call("update_book", { book: "osct", sourceOfTruth: "digital" })).data.book.sourceOfTruth).toBe("digital");
    // Two surfaces, one placed by hand, one laid in a row by the server
    const surfaces = await call("put_scene", { book: "osct", scene: "studio-a", label: "Studio A – night", passes: [{ type: "vignette", strength: 0.8 }], surfaces: [
      { id: "left", label: "40", widthMm: 230, heightMm: 320, place: { x: -115, y: 0, z: 0 } },
      { id: "poster", label: "Poster", widthMm: 400, heightMm: 600 },
    ] });
    expect(surfaces.ok, JSON.stringify(surfaces.data)).toBe(true);
    expect(surfaces.data.scene).toMatchObject({ label: "Studio A – night", passes: [{ type: "vignette", strength: 0.8 }] });
    expect(surfaces.data.scene.surfaces.map((f: any) => f.id)).toEqual(["left", "poster"]);
    expect(surfaces.data.scene.surfaces[0].place).toEqual({ x: -115, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    for (const key of ["x", "y", "z", "rx", "ry", "rz"]) expect(typeof surfaces.data.scene.surfaces[1].place[key], key).toBe("number");
    // An entry on the poster with a placed target; taking the poster away needs the person's yes
    const onPoster = await call("add_entry", { book: "osct", title: "On the poster", id: "on-the-poster", scene: "studio-a", surface: "poster", target: { imageSrc: "https://cdn.example/p.jpg", place: { surface: "poster", x: 10, y: 10, width: 50 } } });
    expect(onPoster.ok, JSON.stringify(onPoster.data)).toBe(true);
    const narrowed = [{ id: "left", label: "40", widthMm: 230, heightMm: 320, place: { x: -115, y: 0, z: 0 } }];
    const inUse = await call("put_scene", { book: "osct", scene: "studio-a", surfaces: narrowed });
    expect(inUse.ok).toBe(false);
    expect(inUse.data.error).toMatchObject({ status: 409, code: "surfaces-in-use" });
    const cleared = await call("put_scene", { book: "osct", scene: "studio-a", surfaces: narrowed, apply: true });
    expect(cleared.ok, JSON.stringify(cleared.data)).toBe(true);
    expect(cleared.data.cleared).toEqual({ entries: ["on-the-poster"], targets: ["on-the-poster"] });
    const master = await call("put_book_passes", { book: "osct", passes: [{ type: "grade", reach: "all", saturation: 0.6 }] });
    expect(master.data.passes).toEqual([{ type: "grade", reach: "all", saturation: 0.6 }]);
    const environment = await call("put_environment", { book: "osct", environment: { world: "cafe", onionSky: false } });
    expect(environment.data.environment).toEqual({ world: "cafe", onionSky: false });
    let draft = await readerReads();
    expect(draft.book).toMatchObject({ passes: [{ type: "grade", reach: "all", saturation: 0.6 }], environment: { world: "cafe", onionSky: false } });
    expect(draft.scenes.map((s: any) => s.id)).toEqual(["s1", "studio-a", "studio-b", "wall"]);
    expect(draft.entries.find((e: any) => e.id === "on-the-poster")).toMatchObject({ scene: "studio-a" });
    expect(draft.entries.find((e: any) => e.id === "on-the-poster").surface).toBeUndefined();
    // Move and group in two steps
    const moving = await call("move_scenes", { book: "osct", scenes: ["wall"], position: 0 });
    expect(moving.data).toMatchObject({ applied: false, plan: { order: ["wall", "s1", "studio-a", "studio-b"], moved: ["wall"] } });
    expect((await call("move_scenes", { book: "osct", scenes: ["wall"], position: 0, apply: true })).data.applied).toBe(true);
    const grouped = await call("group_scenes", { book: "osct", label: "Studios", scenes: ["studio-a", "studio-b"], apply: true });
    expect(grouped.data).toMatchObject({ applied: true, plan: { group: { id: "studios" } } });
    draft = await readerReads();
    expect(draft.groups).toEqual([{ id: "studios", label: "Studios" }]);
    const scenes = await call("list_scenes", { book: "osct" });
    expect(scenes.data.groups).toEqual([{ id: "studios", label: "Studios", scenes: ["studio-a", "studio-b"] }]);
    expect(scenes.data.scenes.find((s: any) => s.id === "wall").surfaces[0]).toMatchObject({ id: wallSurface, reference: null });
    expect((await call("ungroup", { book: "osct", group: "studios" })).data.scenes).toEqual(["studio-a", "studio-b"]);
    // Removing: the impact first; the opening scene stays
    const full = await call("delete_scene", { book: "osct", scene: "studio-b" });
    expect(full.data).toMatchObject({ deleted: false, impact: { kind: "scene", scene: { id: "studio-b" }, entries: [{ id: "castle" }] } });
    expect(full.data.next).toContain("Show the person the impact");
    expect((await remove("delete_scene", { book: "osct", scene: "wall" })).second.ok).toBe(true);
    expect((await remove("delete_scene", { book: "osct", scene: "studio-a" })).second.data.deleted.entries).toEqual(["on-the-poster"]);
    const opening = await call("delete_scene", { book: "osct", scene: "s1" });
    expect(opening.data.error).toMatchObject({ status: 409, code: "initial-scene" });
    expect((await call("put_environment", { book: "osct", environment: null })).data.environment).toBeNull();
    expect((await call("put_book_passes", { book: "osct", passes: null })).data.passes).toBeNull();
    // A 3.0 book needs no migration
    expect((await call("migrate_3", { book: "osct" })).data).toMatchObject({ applied: false, plan: { upToDate: true } });
    await readerReads();
  });

  it("starts with an AI connection's token instead: no mail step, whoami names it, saves name it in the log, publish is refused (#142)", async () => {
    // the person: signed in in the browser, makes the token on the books page (POST /user/tokens with the session)
    const json = async (method: string, path: string, body?: unknown, token?: string) => {
      const response = await fetch(`${api}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json().catch(() => null)) as any };
    };
    const { data: request } = await json("POST", "/auth/request", { email: "editor@example.test" });
    const { data: verified } = await json("POST", "/auth/verify", { requestId: request.requestId, code: lastCode(mailLog) });
    const made = await json("POST", "/user/tokens", { name: "Claude in the e2e test" }, verified.session);
    expect(made.status).toBe(201);
    expect(made.data.token).toMatch(/^osct_/);

    const tokenClient = new Client({ name: "osct-mcp-e2e-token", version: "0.0.0" });
    await tokenClient.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve(ROOT, "mcp/bin/osct-mcp.mjs")],
        env: { ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === "string")) as Record<string, string>), OSCT_API_URL: api, OSCT_EDITOR_URL: "http://localhost:5175/editor", OSCT_EDITOR_TOKEN: made.data.token },
        stderr: "pipe",
        cwd: ROOT,
      }),
    );
    try {
      const callAs = async (name: string, args: Record<string, unknown> = {}) => {
        const result = (await tokenClient.callTool({ name, arguments: args })) as { content: { text?: string }[]; isError?: boolean };
        const raw = result.content.map(c => c.text ?? "").join("");
        return { ok: !result.isError, raw, data: JSON.parse(raw) as any };
      };
      expect((await tokenClient.listTools()).tools.map(t => t.name)).toEqual(expect.arrayContaining(["whoami", "list_books", "put_entity", "publish"]));
      const who = await callAs("whoami");
      expect(who.data.user.email).toBe("editor@example.test");
      expect(who.data.signedIn).toMatchObject({ with: "token", token: { name: "Claude in the e2e test" } });
      expect(who.raw).not.toContain(made.data.token);

      const castle = (await callAs("get_entity", { book: "osct", ref: "castle" })).data.entity;
      const saved = await callAs("put_entity", { book: "osct", ref: "castle", entity: { ...castle, params: { scale: 3 } } });
      expect(saved.ok, saved.raw).toBe(true);
      const changes = await callAs("list_changes", { book: "osct", limit: 1 });
      expect(changes.data.changes[0]).toMatchObject({ kind: "entity", ref: "castle", user: "editor@example.test", token: "Claude in the e2e test" });

      // a removal through the token: the same two steps as the person's (#198), the log names the token
      const added = await callAs("add_entry", { book: "osct", title: "Robot", scene: "studio-b", target: { imageSrc: "https://cdn.example/robot.jpg" } });
      expect(added.ok, added.raw).toBe(true);
      const { second: removed } = await remove("delete_entry", { book: "osct", entry: added.data.entry.id }, callAs);
      expect(removed.ok, JSON.stringify(removed.data)).toBe(true);
      const removal = await callAs("list_changes", { book: "osct", limit: 2 });
      expect(removal.data.changes.map((c: any) => [c.kind, c.after, c.token])).toEqual(expect.arrayContaining([["entry", null, "Claude in the e2e test"], ["target", null, "Claude in the e2e test"]]));

      const publish = await callAs("publish", { book: "osct", env: "local" });
      expect(publish.ok).toBe(false);
      expect(publish.data.error).toMatchObject({ status: 403, code: "not-for-ai" });
    } finally {
      await tokenClient.close().catch(() => undefined);
    }
    // revoked in the browser: the next start's whoami says so
    expect((await json("DELETE", `/user/tokens/${made.data.apiToken.id}`, undefined, verified.session)).status).toBe(204);
    expect((await json("GET", "/user", undefined, made.data.token)).data.error.code).toBe("token-revoked");
  }, 60000);
});
