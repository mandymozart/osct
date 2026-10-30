import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { registerContentTools } from "../src/content.ts";
import { fakeFetch, recorder, VIDEO_ENTITY, type Seen } from "./helpers.ts";

const LINKS = { editor: "http://localhost:5175/editor" };

const TREE = {
  book: { id: "osct", title: "Test Book", author: "Someone", spreads: 2 },
  spreads: [
    { id: "s1", title: "One", firstPage: 1, lastPage: 2, entries: [{ id: "racoon", title: "Racoon", category: "glossary", page: 1, target: { id: "racoon", imageSrc: "/img.jpg", entity: { type: "model", assets: [{ id: "m", assetType: "glb", src: "/m.glb" }] } } }] },
    {
      id: "s2",
      title: "Two",
      firstPage: 3,
      lastPage: 4,
      entries: [
        { id: "castle", title: "Castle", category: "video", page: 3, target: { id: "castle-target", imageSrc: "/c.jpg", entity: { ref: "castle" } } },
        { id: "text", title: "Text", category: "text", page: 4, target: null },
      ],
    },
  ],
  unassigned: [],
};
const ENTITIES = { entities: { castle: VIDEO_ENTITY } };

/** What the declared plugin recorded (content schema 2.14): a layer and a node type with their parameters */
const REGISTERED = {
  components: { tint: { description: "Tints.", nodeTypes: ["video"], params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." } } } },
  nodeTypes: { sparkle: { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } } },
  passes: {},
};

/** The editor's API as the tools see it; `sources: false` = a book without Code tab sources */
function editorApi(seen: Seen, { sources = true } = {}) {
  const { method, path } = seen;
  if (path === "/editor/books") return { json: { books: [{ id: "osct", title: "Test Book", author: "Someone", spreads: 2, lastPublish: null }] } };
  if (path === "/editor/books/osct") return { json: TREE };
  if (path === "/editor/books/osct/entities") return { json: ENTITIES };
  if (method === "PUT" && path.startsWith("/editor/books/osct/entities/")) return { json: { ref: path.split("/").pop(), entity: seen.body } };
  if (method === "PUT" && path === "/editor/books/osct/targets/castle-target") return { json: { target: { id: "castle-target", imageSrc: "/c.jpg", ...(seen.body as object) } } };
  if (method === "PUT" && path.startsWith("/editor/books/osct/targets/")) return { status: 404, json: { error: { code: "not-found", message: "No such target." } } };
  if (method === "POST" && path === "/editor/books/osct/entries") return { status: 201, json: { entry: { id: "p3-new", ...(seen.body as object) }, spreadId: "s2" } };
  if (method === "DELETE" && path === "/editor/books/osct/entries/castle") return { status: 204 };
  if (path === "/editor/books/osct/draft/latest.json") return { json: { build: "abcdef012345", hash: "abcdef012345" + "0".repeat(52) } };
  if (path === "/editor/books/osct/draft/abcdef012345/game.config.json") return { json: { version: { schema: "2.14" }, plugins: [{ id: "tint", src: "/p.js", api: "1.2", registered: REGISTERED }], entities: ENTITIES.entities } };
  if (path === "/editor/books/osct/draft/abcdef012345/files.json") return { json: { "/m.glb": { size: 1 } } };
  if (path === "/editor/books/osct/plugins") return { json: { plugins: sources ? [{ id: "glow", size: 10 }] : [] } };
  if (path === "/editor/books/osct/plugins/glow") return { json: { plugin: { id: "glow", source: 'api.registerLayer("glow", {}, { glsl: "" }); api.registerNodeType("beam", {}, build);' } } };
  if (method === "POST" && path === "/editor/books/osct/spreads") {
    const body = seen.body as any;
    return { status: 201, json: { spread: { id: body.id ?? (body.format === "spread" ? "spread-1" : body.format), title: body.title ?? "New spread", firstPage: 5, lastPage: 6 }, moved: { spreads: 0, entries: 0, targets: 0 } } };
  }
  if (method === "PUT" && path === "/editor/books/osct/spreads/s2") return { json: { spread: { id: "s2", title: "Two", firstPage: 3, lastPage: 4, ...(seen.body as object) } } };
  if (method === "DELETE" && path === "/editor/books/osct/spreads/s1") return { status: 204 };
  if (method === "DELETE" && path === "/editor/books/osct/spreads/s2") return { status: 409, json: { error: { code: "spread-not-empty", message: "The spread has 2 entries – delete them first.", entries: ["castle", "text"] } } };
  if (method === "PUT" && path === "/editor/books/osct/passes") return { json: { passes: (seen.body as any).passes } };
  if (method === "PUT" && path === "/editor/books/osct/environment") return { json: { environment: (seen.body as any).environment } };
  if (method === "POST" && path === "/editor/books/osct/publish") return { json: { env: (seen.body as any).env, build: "abcdef012345", hash: "h", publishedAt: "now" } };
  if (path === "/editor/books/osct/versions") return { json: { versions: [{ env: "local", build: "abcdef012345" }] } };
  if (path.startsWith("/editor/books/osct/changes")) return { json: { changes: [{ kind: "entity", ref: "castle" }], limit: path } };
  if (path.startsWith("/editor/books/osct/assets") && method === "GET") return { json: { assets: [{ id: "a", kind: "image" }], query: path } };
  if (method === "POST" && path === "/editor/books/osct/assets") return { status: 201, json: { asset: { id: "11111111-1111-4111-8111-111111111111", name: seen.headers["X-File-Name"], size: (seen.rawBody as Uint8Array).byteLength } } };
  if (method === "DELETE" && path === "/editor/books/osct/assets/11111111-1111-4111-8111-111111111111") return { status: 409, json: { error: { code: "asset-in-use", message: "Used.", usages: [{ kind: "target", ref: "racoon" }] } } };
  if (method === "DELETE" && path === "/editor/books/osct/assets/11111111-1111-4111-8111-111111111111?force=1") return { status: 204 };
  if (method === "POST" && path === "/editor/books/osct/import") return { json: { book: { id: "osct" }, counts: { spreads: 2 }, body: seen.body } };
  return undefined;
}

describe("the content tools", () => {
  let rec: ReturnType<typeof recorder>;
  let seen: Seen[];
  beforeEach(() => {
    const fake = fakeFetch(editorApi);
    seen = fake.seen;
    rec = recorder();
    registerContentTools(rec.server, fake.api(), LINKS);
  });

  it("registers every tool of the list with a description and an input schema", () => {
    expect([...rec.tools.keys()].sort()).toEqual(
      [
        "add_entry", "add_spread", "delete_asset", "delete_entry", "delete_spread", "describe_content_model", "get_book", "get_draft", "get_entity", "get_spread", "import_book", "list_assets",
        "list_books", "list_changes", "list_versions", "publish", "put_book_passes", "put_entity", "put_environment", "put_spread", "put_target", "upload_asset",
      ].sort(),
    );
    for (const [name, tool] of rec.tools) {
      expect(typeof tool.config.description, name).toBe("string");
      expect(tool.config.inputSchema, name).toBeDefined();
      expect(tool.config.annotations, name).toBeDefined();
    }
  });

  it("list_books adds the editor's link; get_book counts", async () => {
    const books = await rec.call("list_books");
    expect(books.ok).toBe(true);
    expect(books.data.books[0].open).toBe("http://localhost:5175/editor/osct/");
    const book = await rec.call("get_book", { book: "osct" });
    expect(book.data.counts).toEqual({ spreads: 2, entries: 3, targets: 2 });
    expect(seen.map(s => s.path)).toEqual(["/editor/books", "/editor/books/osct"]);
  });

  it("get_spread resolves a shared entity next to its ref, by id or by page", async () => {
    const byId = await rec.call("get_spread", { book: "osct", spread: "s2" });
    expect(byId.ok).toBe(true);
    expect(byId.data.spread).toEqual({ id: "s2", title: "Two", firstPage: 3, lastPage: 4 });
    expect(byId.data.entries[0].target.ref).toBe("castle");
    expect(byId.data.entries[0].target.entity.type).toBe("video");
    expect(byId.data.entries[1].target).toBeNull();
    expect(byId.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    const byPage = await rec.call("get_spread", { book: "osct", page: 2 });
    expect(byPage.data.spread.id).toBe("s1");
    expect(byPage.data.entries[0].target.entity.type).toBe("model");
    const missing = await rec.call("get_spread", { book: "osct", page: 99 });
    expect(missing.ok).toBe(false);
    expect(missing.data.error.spreads).toHaveLength(2);
    const neither = await rec.call("get_spread", { book: "osct" });
    expect(neither.ok).toBe(false);
  });

  it("get_entity answers one shared entity, or the refs there are", async () => {
    expect((await rec.call("get_entity", { book: "osct", ref: "castle" })).data.entity.type).toBe("video");
    const missing = await rec.call("get_entity", { book: "osct", ref: "ghost" });
    expect(missing.ok).toBe(false);
    expect(missing.data.error.refs).toEqual(["castle"]);
  });

  it("put_entity sends a valid entity and refuses an invalid one before any request", async () => {
    const ok = await rec.call("put_entity", { book: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, params: { scale: 2 } } });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/books/osct/entities/castle" });
    expect((seen[0].body as any).params.scale).toBe(2);
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    seen.length = 0;
    const bad = await rec.call("put_entity", { book: "osct", ref: "castle", entity: { type: "video", assets: [], params: { scale: 0 }, filters: [{ type: "blur" }] } });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.code).toBe("invalid-entity");
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^entity\.params\.scale/), expect.stringMatching(/^entity\.filters\[0\]\.type/)]);
    expect(seen).toHaveLength(0);
  });

  it("put_entity warns about a component type no known plugin provides", async () => {
    const result = await rec.call("put_entity", { book: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, components: [{ type: "spin" }] } });
    expect(result.ok).toBe(true);
    expect(result.data.warnings[0]).toContain("spin");
  });

  it("put_entity checks a recorded plugin component's parameters and reads the book's plugins only when the tree needs them (#90)", async () => {
    const tinted = await rec.call("put_entity", { book: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, components: [{ type: "tint", opacity: 0.4 }] } });
    expect(tinted.ok).toBe(true);
    expect(tinted.data.warnings).toBeUndefined();
    seen.length = 0;
    const tooMuch = await rec.call("put_entity", { book: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, components: [{ type: "tint", opacity: 4 }] } });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.data.error.problems).toEqual([expect.stringMatching(/^entity\.components\[0\]\.opacity: expected a number from 0 to 1/)]);
    expect(seen.some(s => s.method === "PUT")).toBe(false);
    seen.length = 0;
    await rec.call("put_entity", { book: "osct", ref: "castle", entity: VIDEO_ENTITY });
    expect(seen.map(s => s.path)).toEqual(["/editor/books/osct/entities/castle"]);
  });

  it("put_entity accepts a plugin's node type: recorded (params checked), read from a source, unverified while a source is there", async () => {
    const sparkle = await rec.call("put_entity", { book: "osct", ref: "fx", entity: { type: "sparkle", assets: [], params: { count: 120 } } });
    expect(sparkle.ok).toBe(true);
    const tooMany = await rec.call("put_entity", { book: "osct", ref: "fx", entity: { type: "sparkle", assets: [], params: { count: 9999 } } });
    expect(tooMany.data.error.problems).toEqual([expect.stringMatching(/^entity\.params\.count: expected a number from 1 to 500/)]);
    expect((await rec.call("put_entity", { book: "osct", ref: "fx", entity: { type: "beam", assets: [] } })).data.warnings).toBeUndefined();
    const typo = await rec.call("put_entity", { book: "osct", ref: "fx", entity: { type: "sparkel", assets: [] } });
    expect(typo.ok).toBe(true);
    expect(typo.data.warnings[0]).toMatch(/node types no known plugin registers: sparkel/);
    expect((await rec.call("put_entity", { book: "osct", ref: "fx", entity: { type: "holo-gram", assets: [] } })).ok).toBe(false);
  });

  it("without Code tab sources, the recorded node types are all there are: a typo is refused before any write", async () => {
    const fake = fakeFetch(s => editorApi(s, { sources: false }));
    const r = recorder();
    registerContentTools(r.server, fake.api(), LINKS);
    const typo = await r.call("put_target", { book: "osct", target: "castle-target", entity: { type: "group", assets: [], children: [{ type: "sparkel", assets: [] }] } });
    expect(typo.ok).toBe(false);
    expect(typo.data.error.problems).toEqual([expect.stringMatching(/^entity\.children\[0\]\.type: "sparkel" is not .*sparkle/)]);
    expect(fake.seen.some(s => s.method === "PUT")).toBe(false);
    expect((await r.call("put_target", { book: "osct", target: "castle-target", entity: { type: "sparkle", assets: [] } })).ok).toBe(true);
  });

  it("put_target sends only what changes, links the target's spread, and needs something to change", async () => {
    const ref = await rec.call("put_target", { book: "osct", target: "castle-target", ref: "castle" });
    expect(ref.ok).toBe(true);
    expect(seen[0].body).toEqual({ ref: "castle" });
    expect(ref.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    seen.length = 0;
    const print = await rec.call("put_target", { book: "osct", target: "castle-target", imageSrc: "http://x/img.png", print: { surface: "right", x: 20, y: 30, width: 60 } });
    expect(print.ok).toBe(true);
    expect(seen[0].body).toEqual({ imageSrc: "http://x/img.png", print: { surface: "right", x: 20, y: 30, width: 60 } });
    seen.length = 0;
    const removed = await rec.call("put_target", { book: "osct", target: "castle-target", entity: null, print: null });
    expect(removed.ok).toBe(true);
    expect(seen[0].body).toEqual({ entity: null, print: null });
    const nothing = await rec.call("put_target", { book: "osct", target: "castle-target" });
    expect(nothing.ok).toBe(false);
    const invalid = await rec.call("put_target", { book: "osct", target: "castle-target", entity: { type: "model" } });
    expect(invalid.data.error.code).toBe("invalid-entity");
    const gone = await rec.call("put_target", { book: "osct", target: "nope", ref: "castle" });
    expect(gone.ok).toBe(false);
    expect(gone.data.error).toMatchObject({ status: 404, code: "not-found" });
    await expect(rec.call("put_target", { book: "osct", target: "castle-target", print: { surface: "top", x: 1, y: 1, width: 1 } })).rejects.toThrow();
  });

  it("add_entry posts the entry with its target and links the spread it landed on", async () => {
    const result = await rec.call("add_entry", {
      book: "osct",
      title: "New",
      page: 3,
      target: { imageSrc: "http://x/img.png", print: { surface: "left", x: 10, y: 10, width: 50 }, entity: VIDEO_ENTITY },
    });
    expect(result.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/editor/books/osct/entries" });
    expect((seen[0].body as any).target.print.surface).toBe("left");
    expect(result.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    const byRef = await rec.call("add_entry", { book: "osct", title: "Ref", page: 3, target: { imageSrc: "x", entity: { ref: "castle" } } });
    expect(byRef.ok).toBe(true);
    const invalid = await rec.call("add_entry", { book: "osct", title: "Bad", page: 3, target: { imageSrc: "x", entity: { type: "video" } } });
    expect(invalid.data.error.code).toBe("invalid-entity");
    expect(invalid.data.error.problems[0]).toMatch(/^target\.entity\.assets/);
  });

  it("delete_entry → 204 becomes a deleted line", async () => {
    const result = await rec.call("delete_entry", { book: "osct", entry: "castle" });
    expect(result.data).toEqual({ deleted: "castle", open: "http://localhost:5175/editor/osct/" });
  });

  it("describes the files' own numbers an agent sizes and times a node by (#91)", () => {
    expect(rec.tools.get("list_assets")?.config.description).toMatch(/width \/ height.*durationMs/);
    expect(rec.tools.get("upload_asset")?.config.description).toContain("durationMs");
  });

  it("assets: list by kind, upload a local file with its name, delete refused while in use unless forced", async () => {
    expect((await rec.call("list_assets", { book: "osct", kind: "image" })).data.query).toBe("/editor/books/osct/assets?kind=image");
    const dir = mkdtempSync(join(tmpdir(), "osct-mcp-"));
    const file = join(dir, "Dot.png");
    writeFileSync(file, Buffer.from([137, 80, 78, 71]));
    const uploaded = await rec.call("upload_asset", { book: "osct", file });
    expect(uploaded.ok).toBe(true);
    expect(uploaded.data.asset.name).toBe("Dot.png");
    expect(uploaded.data.size).toBe(4);
    const renamed = await rec.call("upload_asset", { book: "osct", file, name: "dot-1x1.png" });
    expect(renamed.data.asset.name).toBe("dot-1x1.png");
    const missing = await rec.call("upload_asset", { book: "osct", file: join(dir, "nope.png") });
    expect(missing.ok).toBe(false);
    const inUse = await rec.call("delete_asset", { book: "osct", asset: "11111111-1111-4111-8111-111111111111" });
    expect(inUse.ok).toBe(false);
    expect(inUse.data.error).toMatchObject({ code: "asset-in-use", usages: [{ kind: "target", ref: "racoon" }] });
    expect(inUse.data.error.hint).toContain("force");
    expect((await rec.call("delete_asset", { book: "osct", asset: "11111111-1111-4111-8111-111111111111", force: true })).ok).toBe(true);
  });

  it("get_draft: the manifest, the configuration, the files", async () => {
    expect((await rec.call("get_draft", { book: "osct", part: "manifest" })).data.build).toBe("abcdef012345");
    const configuration = await rec.call("get_draft", { book: "osct" });
    expect(configuration.data.configuration.plugins[0].id).toBe("tint");
    expect((await rec.call("get_draft", { book: "osct", part: "files" })).data.files["/m.glb"]).toEqual({ size: 1 });
  });

  it("describe_content_model: the contract, and with a book its plugins and Code tab sources", async () => {
    const plain = await rec.call("describe_content_model");
    expect(plain.data.entity.nodeTypes).toContain("model");
    expect(seen).toHaveLength(0);
    const book = await rec.call("describe_content_model", { book: "osct" });
    expect(book.data.components.declaredPlugins).toEqual([{ id: "tint", src: "/p.js", api: "1.2", recorded: true }]);
    expect(book.data.components.plugins.tint).toMatchObject({ plugin: "tint", params: { opacity: { min: 0, max: 1 } } });
    expect(book.data.entity.pluginNodeTypes.recorded.sparkle).toMatchObject({ plugin: "tint", params: { count: { max: 500 } } });
    expect(book.data.entity.pluginNodeTypes.known).toEqual(["sparkle", "beam"]);
    expect(book.data.components.codeTabSources).toEqual([{ id: "glow", components: [], layers: ["glow"], nodeTypes: ["beam"], passes: [] }]);
  });

  it("add_spread: a double page after a spread, a cover; the link opens the new spread", async () => {
    const page = await rec.call("add_spread", { book: "osct", format: "spread", after: "s1", title: "Studio C" });
    expect(page.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/editor/books/osct/spreads", body: { format: "spread", after: "s1", title: "Studio C" } });
    expect(page.data.open).toBe("http://localhost:5175/editor/osct/spread-1/");
    expect(page.data.moved).toEqual({ spreads: 0, entries: 0, targets: 0 });
    const cover = await rec.call("add_spread", { book: "osct", format: "cover" });
    expect(seen[1].body).toEqual({ format: "cover" });
    expect(cover.data.open).toBe("http://localhost:5175/editor/osct/cover/");
    seen.length = 0;
    const misplaced = await rec.call("add_spread", { book: "osct", format: "back", after: "s1" });
    expect(misplaced.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("put_spread: title, format and the spread's own passes, checked before they are sent", async () => {
    const ok = await rec.call("put_spread", { book: "osct", spread: "s2", title: "Zwei", passes: [{ type: "bloom", strength: 1.5 }] });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/books/osct/spreads/s2", body: { title: "Zwei", passes: [{ type: "bloom", strength: 1.5 }] } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    const off = await rec.call("put_spread", { book: "osct", spread: "s2", passes: null });
    expect(seen[1].body).toEqual({ passes: null });
    expect(off.ok).toBe(true);
    seen.length = 0;
    const bad = await rec.call("put_spread", { book: "osct", spread: "s2", passes: [{ type: "bloom", strength: 9 }, { type: "glow" }] });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.code).toBe("invalid-passes");
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^passes\[0\]\.strength/), expect.stringMatching(/^passes\[1\]\.type: "glow"/)]);
    expect((await rec.call("put_spread", { book: "osct", spread: "s2" })).ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("delete_spread: an empty one goes; one with entries is refused with the entries and a hint", async () => {
    expect((await rec.call("delete_spread", { book: "osct", spread: "s1" })).data).toEqual({ deleted: "s1", open: "http://localhost:5175/editor/osct/" });
    const full = await rec.call("delete_spread", { book: "osct", spread: "s2" });
    expect(full.ok).toBe(false);
    expect(full.data.error).toMatchObject({ status: 409, code: "spread-not-empty", entries: ["castle", "text"] });
    expect(full.data.error.hint).toContain("delete_entry");
  });

  it("put_book_passes: the book's master chain, checked; null removes it", async () => {
    const ok = await rec.call("put_book_passes", { book: "osct", passes: [{ type: "vignette", strength: 0.4 }, { type: "grade", reach: "all" }] });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/books/osct/passes", body: { passes: [{ type: "vignette", strength: 0.4 }, { type: "grade", reach: "all" }] } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    expect((await rec.call("put_book_passes", { book: "osct", passes: null })).data.passes).toBeNull();
    seen.length = 0;
    const bad = await rec.call("put_book_passes", { book: "osct", passes: [{ type: "grade", reach: "camera" }] });
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^passes\[0\]\.reach: expected one of ar, all/)]);
    expect(seen).toHaveLength(0);
  });

  it("put_environment: the world, the onion sky and their assets, checked; null removes it", async () => {
    const environment = { world: "cafe", onionSky: false, worldSrc: "http://api.test/api/content/assets/osct/w/room.glb" };
    const ok = await rec.call("put_environment", { book: "osct", environment });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/books/osct/environment", body: { environment } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    expect((await rec.call("put_environment", { book: "osct", environment: null })).data.environment).toBeNull();
    seen.length = 0;
    const bad = await rec.call("put_environment", { book: "osct", environment: { world: "cafe", onionSky: true, skySrc: "http://x/sky.glb" } });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.problems[0]).toMatch(/skySrc must be an equirectangular image/);
    expect(seen).toHaveLength(0);
    await expect(rec.call("put_environment", { book: "osct", environment: { world: "forest", onionSky: true } })).rejects.toThrow();
  });

  it("publish: local and staging go to the API, production is refused without a request", async () => {
    const local = await rec.call("publish", { book: "osct", env: "local", note: "check" });
    expect(local.ok).toBe(true);
    expect(seen[0].body).toEqual({ env: "local", note: "check" });
    expect((await rec.call("publish", { book: "osct", env: "staging" })).ok).toBe(true);
    seen.length = 0;
    const production = await rec.call("publish", { book: "osct", env: "production" });
    expect(production.ok).toBe(false);
    expect(production.data.error.code).toBe("production-is-a-person");
    expect(production.data.open).toBe("http://localhost:5175/editor/osct/");
    expect(seen).toHaveLength(0);
  });

  it("the logs", async () => {
    expect((await rec.call("list_versions", { book: "osct" })).data.versions[0].env).toBe("local");
    expect((await rec.call("list_changes", { book: "osct", limit: 5 })).data.limit).toBe("/editor/books/osct/changes?limit=5");
    expect((await rec.call("list_changes", { book: "osct" })).data.limit).toBe("/editor/books/osct/changes");
  });

  it("import_book: a configuration, the cdn, or neither", async () => {
    const result = await rec.call("import_book", { book: "osct", configuration: { book: { id: "osct" } }, assetsBase: "http://localhost:5174" });
    expect(result.ok).toBe(true);
    expect(seen[0].body).toEqual({ configuration: { book: { id: "osct" } }, assetsBase: "http://localhost:5174" });
    const cdn = await rec.call("import_book", { book: "osct", source: "cdn" });
    expect(seen[1].body).toEqual({ source: "cdn" });
    expect(cdn.ok).toBe(true);
    expect((await rec.call("import_book", { book: "osct" })).ok).toBe(false);
  });

  it("API errors come back as the API's { code, message } with a hint", async () => {
    const fake = fakeFetch(() => ({ status: 403, json: { error: { code: "forbidden", message: "Not allowed.", role: "editor" } } }));
    const r = recorder();
    registerContentTools(r.server, fake.api(), LINKS);
    const result = await r.call("list_books");
    expect(result.ok).toBe(false);
    expect(result.data.error).toMatchObject({ status: 403, code: "forbidden", message: "Not allowed.", role: "editor" });
    expect(result.data.error.hint).toContain("editor");
  });
});
