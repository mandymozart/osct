import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api.ts";
import { registerContentTools } from "../src/content.ts";
import { hintFor, PUBLISH_REFUSALS } from "../src/result.ts";
import { fakeFetch, recorder, VIDEO_ENTITY, type Seen } from "./helpers.ts";

const LINKS = { editor: "http://localhost:5175/editor" };

const PLACE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const TREE = {
  experience: { id: "osct", title: "Test Experience", experience: { id: "osct", title: "Test Experience", book: { author: "Someone" } }, initialScene: "s1", scenes: 2 },
  scenes: [
    { id: "s1", label: "One", surfaces: [{ id: "surface", widthMm: 460, heightMm: 320, place: PLACE }], entries: [{ id: "racoon", title: "Racoon", category: "glossary", scene: "s1", target: { id: "racoon", imageSrc: "/img.jpg", entity: { type: "model", assets: [{ id: "m", assetType: "glb", src: "/m.glb" }] } } }] },
    {
      id: "s2",
      label: "Two",
      surfaces: [{ id: "left", widthMm: 230, heightMm: 320, place: { ...PLACE, x: -115 } }, { id: "right", widthMm: 230, heightMm: 320, place: { ...PLACE, x: 115 } }],
      entries: [
        { id: "castle", title: "Castle", category: "video", scene: "s2", surface: "left", target: { id: "castle-target", imageSrc: "/c.jpg", place: { surface: "left", x: 10, y: 10, width: 50 }, entity: { ref: "castle" } } },
        { id: "text", title: "Text", category: "text", scene: "s2", target: null },
      ],
    },
  ],
  groups: [],
};
const ENTITIES = { entities: { castle: VIDEO_ENTITY } };
/** `GET …/entries`: the fields as written (the scene among them), the target */
const ENTRIES = [
  { id: "racoon", category: "glossary", title: "Racoon", scene: "s1", body: "A *beast*.", tags: ["animal"], target: { id: "racoon", imageSrc: "/img.jpg" } },
  { id: "text", category: "text", title: "Text", scene: "s2", body: "Onion skin.", tags: [], author: "Kévin", target: null },
];

/** What the declared plugin recorded: a layer and a node type with their parameters */
const REGISTERED = {
  components: { tint: { description: "Tints.", nodeTypes: ["video"], params: { opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much." } } } },
  nodeTypes: { sparkle: { description: "Points.", params: { count: { kind: "number", default: 50, min: 1, max: 500, description: "How many." } } } },
  passes: { scanLines: { description: "Scan lines.", params: { lines: { kind: "number", default: 200, min: 10, max: 800, description: "How many." } } } },
  appearances: { softFade: { description: "Fades.", params: { duration: { kind: "number", default: 800, min: 50, max: 10000, description: "How long." } } } },
};

const CONFIRMATION = "1900000000.0123456789abcdef0123456789abcdef";

/**
 * A removal in the API's two steps (#198): without `confirm` 409 confirm-delete with the impact, with a stale one
 * confirmation-void, with the right one the removal
 */
function removal(seen: Seen) {
  const body = (seen.body ?? {}) as { confirm?: string; deleteFiles?: boolean };
  const scene = seen.path.includes("/scenes/");
  if (body.confirm === CONFIRMATION) {
    return { json: { deleted: { scene: scene ? "s2" : null, entries: scene ? ["castle", "text"] : ["castle"], targets: ["castle-target"], entities: [], files: body.deleteFiles ? ["a1"] : [] } } };
  }
  const impact = {
    kind: scene ? "scene" : "entry",
    ...(scene ? { scene: { id: "s2", label: "Two" } } : { entry: { id: "castle", title: "Castle", category: "video", scene: "s2" } }),
    keptEntities: [{ ref: "castle", type: "video", targets: ["castle-target"], usedBy: ["other-target"] }],
    files: { onlyHere: [{ id: "a1", name: "castle.png" }], elsewhere: [{ id: "a2", name: "shared.png", usedBy: [{ kind: "target", ref: "racoon" }] }] },
    counts: { entries: scene ? 2 : 1, targets: 1, entities: 0, keptEntities: 1, filesOnlyHere: 1, filesElsewhere: 1 },
  };
  return { status: 409, json: { error: { code: body.confirm ? "confirmation-void" : "confirm-delete", message: body.confirm ? "The confirmation is void." : "Removing takes 1 entry.", impact, confirmation: { id: CONFIRMATION, expiresAt: "2030-03-17T17:46:40Z" } } } };
}

/** The editor's API as the tools see it; `sources: false` = an experience without Code tab sources */
function editorApi(seen: Seen, { sources = true } = {}) {
  const { method, path } = seen;
  if (path === "/editor/experiences") return { json: { experiences: [{ id: "osct", title: "Test Experience", experience: { id: "osct", title: "Test Experience", book: { author: "Someone" } }, initialScene: "s1", scenes: 2, lastPublish: null }] } };
  if (method === "GET" && path === "/editor/experiences/osct") return { json: TREE };
  if (path === "/editor/experiences/osct/entities") return { json: ENTITIES };
  if (method === "PUT" && path.startsWith("/editor/experiences/osct/entities/")) return { json: { ref: path.split("/").pop(), entity: seen.body } };
  if (method === "PUT" && path === "/editor/experiences/osct/targets/castle-target") return { json: { target: { id: "castle-target", imageSrc: "/c.jpg", ...(seen.body as object) } } };
  if (method === "PUT" && path.startsWith("/editor/experiences/osct/targets/")) return { status: 404, json: { error: { code: "not-found", message: "No such target." } } };
  if (method === "POST" && path === "/editor/experiences/osct/entries") return { status: 201, json: { entry: { id: "new", ...(seen.body as object) }, scene: (seen.body as { scene: string }).scene } };
  if (method === "GET" && path === "/editor/experiences/osct/entries") return { json: { entries: ENTRIES } };
  if (method === "PUT" && path === "/editor/experiences/osct/entries/racoon") {
    const scene = (seen.body as { scene?: string }).scene ?? "s1";
    return { json: { entry: { ...ENTRIES[0], ...(seen.body as object) }, scene, previousScene: "s1" } };
  }
  if (method === "PUT" && path === "/editor/experiences/osct") {
    const { title, book } = seen.body as { title?: string; book?: Record<string, unknown> | null };
    const before = { author: "Someone" };
    const merged = book === null ? undefined : book ? Object.fromEntries(Object.entries({ ...before, ...book }).filter(([, v]) => v !== null && v !== "")) : before;
    return { json: { experience: { id: "osct", title: title ?? "Test Experience", ...(merged ? { book: merged } : {}) } } };
  }
  if (method === "DELETE" && /^\/editor\/experiences\/osct\/(scenes\/s2|entries\/castle)$/.test(path)) return removal(seen);
  if (path === "/editor/experiences/osct/draft/latest.json") return { json: { build: "abcdef012345", hash: "abcdef012345" + "0".repeat(52) } };
  if (path === "/editor/experiences/osct/draft/abcdef012345/game.config.json") return { json: { version: { schema: "2.14" }, plugins: [{ id: "tint", src: "/p.js", api: "1.2", registered: REGISTERED }], entities: ENTITIES.entities } };
  if (path === "/editor/experiences/osct/draft/abcdef012345/files.json") return { json: { "/m.glb": { size: 1 } } };
  if (path === "/editor/experiences/osct/plugins") return { json: { plugins: sources ? [{ id: "glow", size: 10 }] : [] } };
  if (path === "/editor/experiences/osct/plugins/glow") return { json: { plugin: { id: "glow", source: 'api.registerLayer("glow", {}, { glsl: "" }); api.registerNodeType("beam", {}, build); api.registerAppearance("popIn", {}, look);' } } };
  if (method === "GET" && path === "/editor/experiences/osct/scenes") {
    return { json: { scenes: TREE.scenes.map(({ entries, ...s }, position) => ({ ...s, position, surfaces: s.surfaces.map(f => ({ ...f, reference: null })), entries: entries.length, targets: entries.filter(e => e.target).length })), groups: [] } };
  }
  if (method === "POST" && path === "/editor/experiences/osct/scenes") {
    const body = seen.body as any;
    return { status: 201, json: { scene: { id: body.id ?? "scene-1", label: body.label ?? "New scene", surfaces: body.surfaces ?? [{ id: "surface", widthMm: 460, heightMm: 320, place: PLACE }] }, position: 1 } };
  }
  if (method === "POST" && path === "/editor/experiences/osct/scenes/move") return { json: { plan: { order: ["s2", "s1"], moved: ["s2"], groups: [] }, applied: !!(seen.body as any).apply } };
  if (method === "PUT" && path === "/editor/experiences/osct/scenes/s2") {
    const body = seen.body as any;
    if (body.surfaces && !body.surfaces.some((f: { id: string }) => f.id === "left") && !body.apply) {
      return { status: 409, json: { error: { code: "surfaces-in-use", message: "Entries and targets lie on surfaces that go.", entries: ["castle"], targets: ["castle-target"] } } };
    }
    return { json: { scene: { id: "s2", label: "Two", surfaces: TREE.scenes[1].surfaces, ...body, apply: undefined }, cleared: body.apply ? { entries: ["castle"], targets: ["castle-target"] } : { entries: [], targets: [] } } };
  }
  if (method === "POST" && path === "/editor/experiences/osct/groups") return { json: { plan: { group: { id: "chapter", label: (seen.body as any).label }, order: ["s1", "s2"], moved: [], groups: [] }, applied: !!(seen.body as any).apply } };
  if (method === "PUT" && path === "/editor/experiences/osct/groups/chapter") return { json: { group: { id: "chapter", label: (seen.body as any).label } } };
  if (method === "DELETE" && path === "/editor/experiences/osct/groups/chapter") return { json: { ungrouped: "chapter", scenes: ["s1", "s2"] } };
  if (method === "POST" && /^\/editor\/experiences\/osct\/changes\/(revert|revert-to|[^/]+\/revert)$/.test(path)) {
    const apply = !!(seen.body as any)?.apply;
    return { json: { plan: { changes: [{ id: "c1", kind: "entity", ref: "castle", status: "revert", later: false, other: false }], chosen: ["c1"], counts: { revert: 1, conflict: 0, notRevertable: 0 }, later: 0, others: [] }, applied: apply, set: apply ? "s1" : null, written: apply ? ["c2"] : [] } };
  }
  if (method === "PUT" && path === "/editor/experiences/osct/scenes/s2/surfaces/left/reference") {
    const body = seen.body as { url?: string | null; fit?: string };
    return { json: { scene: "s2", surface: "left", reference: body.url === null ? null : { url: body.url ?? "/a.png", name: "a.png", fit: body.fit ?? "cover" }, changed: true } };
  }
  if (method === "DELETE" && path === "/editor/experiences/osct/scenes/s1") return { status: 409, json: { error: { code: "initial-scene", message: "The experience opens on this scene." } } };
  if (method === "PUT" && path === "/editor/experiences/osct/passes") return { json: { passes: (seen.body as any).passes } };
  if (method === "PUT" && path === "/editor/experiences/osct/appearance") return { json: { appearance: (seen.body as any).appearance } };
  if (method === "PUT" && path === "/editor/experiences/osct/environment") return { json: { environment: (seen.body as any).environment } };
  if (method === "GET" && path === "/editor/environments") return { json: { env: "local", environments: [{ env: "local", store: "server", publish: true, url: "http://127.0.0.1:8080/api/content/local", warning: "No CDN connected – the published content is stored and served by this server only." }, { env: "staging", store: "cdn", publish: false, url: null, warning: null }] } };
  if (method === "POST" && path === "/editor/experiences/osct/publish")
    return (seen.body as any).env === "local"
      ? { json: { env: "local", store: "server", build: "abcdef012345", hash: "h", publishedAt: "now" } }
      : { status: 403, json: { error: { code: "other-environment", message: "This instance publishes to local only.", env: "local" } } };
  if (method === "POST" && path === "/editor/import/preview") {
    const cdn = (seen.body as any).source === "cdn";
    const id = cdn ? "demo" : (seen.body as any).configuration?.experience?.id;
    return { json: { source: cdn ? "cdn" : "configuration", contentBase: cdn ? "https://cdn.example/demo" : null, manifest: cdn ? { url: "https://cdn.example/demo/latest.json", build: "7457f0c10df1", activatedAt: null } : null,
      incoming: { experience: id, title: id === "demo" ? "The Demo Experience" : "Fresh", build: "7457f0c10df1" }, counts: { scenes: 6, entries: 13, targets: 8, entities: 2 },
      existing: id === "demo" ? { experience: { id: "demo", title: "The Demo Experience" }, draft: { edits: 3 } } : null } };
  }
  if (method === "POST" && path === "/editor/experiences/demo/import") {
    const confirm = (seen.body as any).confirm;
    if (confirm === "1900000000.0123456789abcdef0123456789abcdef") return { json: { experience: { id: "demo" }, counts: { scenes: 2 }, imported: { build: "cdcdcdcdcdcd" } } };
    const details = { comparison: { experience: { id: "demo", title: "Demo" }, incoming: { build: "cdcdcdcdcdcd" }, draft: { basedOn: { build: "abababababab" }, edits: 3 } }, confirmation: { id: "1900000000.0123456789abcdef0123456789abcdef", expiresAt: "2030-03-17T17:46:40Z" } };
    return { status: 409, json: { error: { code: confirm ? "confirmation-void" : "confirm-import", message: confirm ? "The confirmation is void." : "Importing replaces the draft.", ...details } } };
  }
  if (path === "/editor/experiences/osct/versions") return { json: { versions: [{ env: "local", build: "abcdef012345" }] } };
  if (path.startsWith("/editor/experiences/osct/changes")) return { json: { changes: [{ kind: "entity", ref: "castle" }], limit: path } };
  if (path.startsWith("/editor/experiences/osct/assets") && method === "GET") return { json: { assets: [{ id: "a", kind: "image" }], query: path } };
  if (path === "/editor/experiences/osct/assets/credits" && method === "PUT") return { json: { saved: 1, credits: {}, sent: seen.body } };
  if (method === "PUT" && /^\/editor\/experiences\/osct\/assets\/[^/]+$/.test(path)) return { json: { asset: { id: "a", url: "https://cdn/a.webp", name: (seen.body as any).name, imported: false }, changed: true, sent: seen.body, path } };
  if (method === "POST" && path.split("?")[0] === "/editor/experiences/osct/assets") return { status: 201, json: { path, asset: { id: "11111111-1111-4111-8111-111111111111", name: seen.headers["X-File-Name"], size: (seen.rawBody as Uint8Array).byteLength, url: `https://cdn/up/${seen.headers["X-File-Name"]}` } } };
  if (method === "POST" && path === "/editor/experiences/osct/assets/names") {
    const apply = !!(seen.body as any).apply;
    return { json: { plan: { renames: [{ id: "a", url: "https://cdn/a.webp", imported: false, from: "Scan.webp", to: "cover_surface.webp", use: { kind: "reference", ref: "cover/surface", scene: "cover" }, more: 0 }], files: 2, used: 1, unused: 1 }, applied: apply, sent: seen.body } };
  }
  if (method === "DELETE" && path === "/editor/experiences/osct/assets/11111111-1111-4111-8111-111111111111") return { status: 409, json: { error: { code: "asset-in-use", message: "Used.", usages: [{ kind: "target", ref: "racoon" }] } } };
  if (method === "DELETE" && path === "/editor/experiences/osct/assets/11111111-1111-4111-8111-111111111111?force=1") return { status: 204 };
  if (method === "POST" && path === "/editor/experiences/osct/import") return { json: { experience: { id: "osct" }, counts: { scenes: 2 }, body: seen.body } };
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
        "add_entry", "delete_asset", "delete_entry", "describe_content_model", "get_experience", "get_draft", "get_entity", "get_scene", "import_experience", "list_assets", "preview_import",
        "list_experiences", "list_changes", "list_versions", "publish", "put_experience_appearance", "put_experience_passes", "put_entity", "put_environment", "put_target", "upload_asset",
        "get_entries", "update_entry", "update_experience", "set_asset_credits", "plan_asset_names", "apply_asset_names", "rename_asset",
        "list_scenes", "add_scene", "move_scenes", "put_scene", "put_surface", "delete_scene", "group_scenes", "rename_group", "ungroup",
        "set_surface_reference",
        "revert_change", "revert_to",
      ].sort(),
    );
    for (const [name, tool] of rec.tools) {
      expect(typeof tool.config.description, name).toBe("string");
      expect(tool.config.inputSchema, name).toBeDefined();
      expect(tool.config.annotations, name).toBeDefined();
    }
  });

  it("list_experiences adds the editor's link; get_experience counts", async () => {
    const experiences = await rec.call("list_experiences");
    expect(experiences.ok).toBe(true);
    expect(experiences.data.experiences[0].open).toBe("http://localhost:5175/editor/osct/");
    const experience = await rec.call("get_experience", { experience: "osct" });
    expect(experience.data.counts).toEqual({ scenes: 2, entries: 3, targets: 2 });
    expect(experience.data.scenes[1].surfaces.map((f: { id: string }) => f.id)).toEqual(["left", "right"]);
    expect(seen.map(s => s.path)).toEqual(["/editor/experiences", "/editor/experiences/osct"]);
  });

  it("get_scene resolves a shared entity next to its ref; an unknown scene names the scenes there are", async () => {
    const found = await rec.call("get_scene", { experience: "osct", scene: "s2" });
    expect(found.ok).toBe(true);
    expect(found.data.scene).toEqual({ id: "s2", label: "Two", surfaces: TREE.scenes[1].surfaces });
    expect(found.data.entries[0]).toMatchObject({ scene: "s2", surface: "left", target: { ref: "castle", place: { surface: "left", x: 10 } } });
    expect(found.data.entries[0].target.entity.type).toBe("video");
    expect(found.data.entries[1].target).toBeNull();
    expect(found.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    expect((await rec.call("get_scene", { experience: "osct", scene: "s1" })).data.entries[0].target.entity.type).toBe("model");
    const missing = await rec.call("get_scene", { experience: "osct", scene: "s9" });
    expect(missing.ok).toBe(false);
    expect(missing.data.error.scenes).toEqual([{ id: "s1", label: "One" }, { id: "s2", label: "Two" }]);
    await expect(rec.call("get_scene", { experience: "osct", page: 2 })).rejects.toThrow();
  });

  it("get_entity answers one shared entity, or the refs there are", async () => {
    expect((await rec.call("get_entity", { experience: "osct", ref: "castle" })).data.entity.type).toBe("video");
    const missing = await rec.call("get_entity", { experience: "osct", ref: "ghost" });
    expect(missing.ok).toBe(false);
    expect(missing.data.error.refs).toEqual(["castle"]);
  });

  it("put_entity sends a valid entity and refuses an invalid one before any request", async () => {
    const ok = await rec.call("put_entity", { experience: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, params: { scale: 2 } } });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/entities/castle" });
    expect((seen[0].body as any).params.scale).toBe(2);
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    seen.length = 0;
    const bad = await rec.call("put_entity", { experience: "osct", ref: "castle", entity: { type: "video", assets: [], params: { scale: 0 }, filters: [{ type: "blur" }] } });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.code).toBe("invalid-entity");
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^entity\.params\.scale/), expect.stringMatching(/^entity\.filters\[0\]\.type/)]);
    expect(seen).toHaveLength(0);
  });

  it("put_entity warns about a component type no known plugin provides", async () => {
    const result = await rec.call("put_entity", { experience: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, components: [{ type: "spin" }] } });
    expect(result.ok).toBe(true);
    expect(result.data.warnings[0]).toContain("spin");
  });

  it("put_entity checks a recorded plugin component's parameters and reads the experience's plugins only when the tree needs them (#90)", async () => {
    const tinted = await rec.call("put_entity", { experience: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, components: [{ type: "tint", opacity: 0.4 }] } });
    expect(tinted.ok).toBe(true);
    expect(tinted.data.warnings).toBeUndefined();
    seen.length = 0;
    const tooMuch = await rec.call("put_entity", { experience: "osct", ref: "castle", entity: { ...VIDEO_ENTITY, components: [{ type: "tint", opacity: 4 }] } });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.data.error.problems).toEqual([expect.stringMatching(/^entity\.components\[0\]\.opacity: expected a number from 0 to 1/)]);
    expect(seen.some(s => s.method === "PUT")).toBe(false);
    seen.length = 0;
    await rec.call("put_entity", { experience: "osct", ref: "castle", entity: VIDEO_ENTITY });
    expect(seen.map(s => s.path)).toEqual(["/editor/experiences/osct/entities/castle"]);
  });

  it("put_entity accepts a plugin's node type: recorded (params checked), read from a source, unverified while a source is there", async () => {
    const sparkle = await rec.call("put_entity", { experience: "osct", ref: "fx", entity: { type: "sparkle", assets: [], params: { count: 120 } } });
    expect(sparkle.ok).toBe(true);
    const tooMany = await rec.call("put_entity", { experience: "osct", ref: "fx", entity: { type: "sparkle", assets: [], params: { count: 9999 } } });
    expect(tooMany.data.error.problems).toEqual([expect.stringMatching(/^entity\.params\.count: expected a number from 1 to 500/)]);
    expect((await rec.call("put_entity", { experience: "osct", ref: "fx", entity: { type: "beam", assets: [] } })).data.warnings).toBeUndefined();
    const typo = await rec.call("put_entity", { experience: "osct", ref: "fx", entity: { type: "sparkel", assets: [] } });
    expect(typo.ok).toBe(true);
    expect(typo.data.warnings[0]).toMatch(/node types no known plugin registers: sparkel/);
    expect((await rec.call("put_entity", { experience: "osct", ref: "fx", entity: { type: "holo-gram", assets: [] } })).ok).toBe(false);
  });

  it("without Code tab sources, the recorded node types are all there are: a typo is refused before any write", async () => {
    const fake = fakeFetch(s => editorApi(s, { sources: false }));
    const r = recorder();
    registerContentTools(r.server, fake.api(), LINKS);
    const typo = await r.call("put_target", { experience: "osct", target: "castle-target", entity: { type: "group", assets: [], children: [{ type: "sparkel", assets: [] }] } });
    expect(typo.ok).toBe(false);
    expect(typo.data.error.problems).toEqual([expect.stringMatching(/^entity\.children\[0\]\.type: "sparkel" is not .*sparkle/)]);
    expect(fake.seen.some(s => s.method === "PUT")).toBe(false);
    expect((await r.call("put_target", { experience: "osct", target: "castle-target", entity: { type: "sparkle", assets: [] } })).ok).toBe(true);
  });

  it("put_target sends only what changes, links the target's scene, and needs something to change", async () => {
    const ref = await rec.call("put_target", { experience: "osct", target: "castle-target", ref: "castle" });
    expect(ref.ok).toBe(true);
    expect(seen[0].body).toEqual({ ref: "castle" });
    expect(ref.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    seen.length = 0;
    const placed = await rec.call("put_target", { experience: "osct", target: "castle-target", imageSrc: "http://x/img.png", place: { surface: "right", x: 20, y: 30, width: 60 } });
    expect(placed.ok).toBe(true);
    expect(seen[0].body).toEqual({ imageSrc: "http://x/img.png", place: { surface: "right", x: 20, y: 30, width: 60 } });
    expect(placed.data.target.place).toEqual({ surface: "right", x: 20, y: 30, width: 60 });
    seen.length = 0;
    const removed = await rec.call("put_target", { experience: "osct", target: "castle-target", entity: null, place: null });
    expect(removed.ok).toBe(true);
    expect(seen[0].body).toEqual({ entity: null, place: null });
    seen.length = 0;
    expect((await rec.call("put_target", { experience: "osct", target: "castle-target", recognitionOff: true })).ok).toBe(true);
    expect(seen[0].body).toEqual({ recognitionOff: true });
    const nothing = await rec.call("put_target", { experience: "osct", target: "castle-target" });
    expect(nothing.ok).toBe(false);
    const invalid = await rec.call("put_target", { experience: "osct", target: "castle-target", entity: { type: "model" } });
    expect(invalid.data.error.code).toBe("invalid-entity");
    const gone = await rec.call("put_target", { experience: "osct", target: "nope", ref: "castle" });
    expect(gone.ok).toBe(false);
    expect(gone.data.error).toMatchObject({ status: 404, code: "not-found" });
    // No print, no side, no page: the 3.0 place only
    expect((await rec.call("put_target", { experience: "osct", target: "castle-target", print: { surface: "right", x: 1, y: 1, width: 1 } })).ok).toBe(false);
    await expect(rec.call("put_target", { experience: "osct", target: "castle-target", place: { surface: "right", x: 1, y: 1, width: 1, page: 3 } })).rejects.toThrow();
    await expect(rec.call("put_target", { experience: "osct", target: "castle-target", place: { x: 1, y: 1, width: -1 } })).rejects.toThrow();
  });

  it("add_entry posts the entry on its scene with its target and links the scene", async () => {
    const result = await rec.call("add_entry", {
      experience: "osct",
      title: "New",
      scene: "s2",
      surface: "left",
      target: { imageSrc: "http://x/img.png", place: { surface: "left", x: 10, y: 10, width: 50 }, entity: VIDEO_ENTITY },
    });
    expect(result.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/editor/experiences/osct/entries", body: { title: "New", scene: "s2", surface: "left" } });
    expect((seen[0].body as any).target.place).toEqual({ surface: "left", x: 10, y: 10, width: 50 });
    expect(result.data.scene).toBe("s2");
    expect(result.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    const byRef = await rec.call("add_entry", { experience: "osct", title: "Ref", scene: "s2", target: { imageSrc: "x", entity: { ref: "castle" } } });
    expect(byRef.ok).toBe(true);
    const invalid = await rec.call("add_entry", { experience: "osct", title: "Bad", scene: "s2", target: { imageSrc: "x", entity: { type: "video" } } });
    expect(invalid.data.error.code).toBe("invalid-entity");
    expect(invalid.data.error.problems[0]).toMatch(/^target\.entity\.assets/);
  });

  it("add_entry without a target: an entry read only in the list (#223); a body whose braces do not parse is refused", async () => {
    const result = await rec.call("add_entry", { experience: "osct", title: "Onion", scene: "s1", body: "A *bulb*." });
    expect(result.ok).toBe(true);
    expect(seen[0].body).toEqual({ title: "Onion", scene: "s1", body: "A *bulb*." });
    const broken = await rec.call("add_entry", { experience: "osct", title: "Onion", scene: "s1", body: "Hello {name" });
    expect(broken.data.error.code).toBe("invalid-entry-text");
    expect(seen).toHaveLength(1);
  });

  it("get_entries: every field, filtered by category or a word, with the Entries page's link (#223)", async () => {
    const all = await rec.call("get_entries", { experience: "osct" });
    expect(all.data.count).toBe(2);
    expect(all.data.open).toBe("http://localhost:5175/editor/osct/");
    expect((await rec.call("get_entries", { experience: "osct", category: "text" })).data.entries.map((e: { id: string }) => e.id)).toEqual(["text"]);
    expect((await rec.call("get_entries", { experience: "osct", search: "BEAST" })).data.entries.map((e: { id: string }) => e.id)).toEqual(["racoon"]);
  });

  it("update_entry sends only what changes, checked first: the link, the body's braces, at least one field (#223)", async () => {
    const result = await rec.call("update_entry", { experience: "osct", entry: "racoon", body: "A **beast** – {hasKey: it opens|it looks}.", author: null, tags: ["animal", "mask"] });
    expect(result.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/entries/racoon", body: { body: "A **beast** – {hasKey: it opens|it looks}.", author: null, tags: ["animal", "mask"] } });
    expect(result.data.open).toBe("http://localhost:5175/editor/osct/s1/");
    const moved = await rec.call("update_entry", { experience: "osct", entry: "racoon", scene: "s2", surface: "right" });
    expect(seen.at(-1)!.body).toEqual({ scene: "s2", surface: "right" });
    expect(moved.data).toMatchObject({ scene: "s2", previousScene: "s1", open: "http://localhost:5175/editor/osct/s2/" });
    expect((await rec.call("update_entry", { experience: "osct", entry: "racoon", page: 3 })).data.error.code).toBe("mcp");
    await expect(rec.call("update_entry", { experience: "osct", entry: "racoon", scene: null })).rejects.toThrow();
    const warned = await rec.call("update_entry", { experience: "osct", entry: "racoon", body: "a } alone" });
    expect(warned.data.warnings[0]).toMatch(/a } without its \{/);
    const refusals = [
      [{ media: "javascript:alert(1)" }, "invalid-entry"],
      [{ body: "{a|b}" }, "invalid-entry-text"],
      [{ body: "{clock(t)}" }, "invalid-entry-text"],
      [{}, "mcp"],
    ] as const;
    const before = seen.length;
    for (const [change, code] of refusals) expect((await rec.call("update_entry", { experience: "osct", entry: "racoon", ...change })).data.error.code).toBe(code);
    expect(seen).toHaveLength(before);
    await expect(rec.call("update_entry", { experience: "osct", entry: "racoon", category: "poem" })).rejects.toThrow();
  });

  it("update_experience changes the title and the printed book; no tool edits the onboarding – it is the app's (#223, #236, #320)", async () => {
    const titled = await rec.call("update_experience", { experience: "osct", title: "Onion Skin", book: { publisher: null } });
    expect(seen.at(-1)).toMatchObject({ method: "PUT", path: "/editor/experiences/osct", body: { title: "Onion Skin", book: { publisher: null } } });
    expect(titled.data.experience).toEqual({ id: "osct", title: "Onion Skin", book: { author: "Someone" } });
    expect(titled.data.open).toBe("http://localhost:5175/editor/osct/");
    const published = await rec.call("update_experience", { experience: "osct", book: { publisher: "Building Fictions" } });
    expect(published.data.experience.book).toEqual({ author: "Someone", publisher: "Building Fictions" });
    const none = await rec.call("update_experience", { experience: "osct", book: null });
    expect(seen.at(-1)!.body).toEqual({ book: null });
    expect(none.data.experience.book).toBeUndefined();
    // The recognition path (#306, content schema 4.2): "original" (default) or "prepared", null = the default
    expect((await rec.call("update_experience", { experience: "osct", recognition: "prepared" })).ok).toBe(true);
    expect(seen.at(-1)!.body).toEqual({ recognition: "prepared" });
    await expect(rec.call("update_experience", { experience: "osct", recognition: "compiled" })).rejects.toThrow();
    const before = seen.length;
    expect((await rec.call("update_experience", { experience: "osct" })).data.error.code).toBe("mcp");
    expect((await rec.call("update_experience", { experience: "osct", book: {} })).data.error.code).toBe("mcp");
    expect(seen).toHaveLength(before);
    expect([...rec.tools.keys()].filter(name => /tutorial|onboarding/.test(name))).toEqual([]);
  });

  it("no source of truth any more: update_experience refuses it, every experience adds and removes its scenes (#320)", async () => {
    await expect(rec.call("update_experience", { experience: "osct", sourceOfTruth: "digital" })).resolves.toMatchObject({ data: { error: { code: "mcp" } } });
    await expect(rec.call("update_experience", { experience: "osct", book: { author: "A", sourceOfTruth: "print" } })).rejects.toThrow();
    for (const tool of ["delete_scene", "add_scene", "update_experience"]) expect(rec.tools.get(tool)!.config.description, tool).not.toMatch(/print-first|digital-first|sourceOfTruth/);
    expect(hintFor(new ApiError(409, "print-first", "gone"))).not.toMatch(/sourceOfTruth/);
  });

  it("scenes (#307, schema 3.0): list, add anywhere from a preset, move and group in two steps, put, ungroup", async () => {
    const list = await rec.call("list_scenes", { experience: "osct" });
    expect(list.data.scenes.map((s: { id: string }) => s.id)).toEqual(["s1", "s2"]);
    expect(list.data.scenes[1]).toMatchObject({ position: 1, label: "Two", entries: 2, targets: 1, surfaces: [{ id: "left", reference: null }, { id: "right" }] });
    const added = await rec.call("add_scene", { experience: "osct", preset: "wall", after: "s1", id: "wall", label: "Studio wall" });
    expect(seen.at(-1)).toMatchObject({ method: "POST", path: "/editor/experiences/osct/scenes", body: { preset: "wall", after: "s1", id: "wall", label: "Studio wall" } });
    expect(added.data.open).toBe("http://localhost:5175/editor/osct/wall/");
    const own = await rec.call("add_scene", { experience: "osct", position: 0, surfaces: [{ id: "cover", label: "Cover", widthMm: 230, heightMm: 320 }] });
    expect(seen.at(-1)!.body).toEqual({ position: 0, surfaces: [{ id: "cover", label: "Cover", widthMm: 230, heightMm: 320 }] });
    expect(own.data.scene.surfaces[0].id).toBe("cover");
    seen.length = 0;
    expect((await rec.call("add_scene", { experience: "osct", after: "s1", position: 0 })).ok).toBe(false);
    expect((await rec.call("move_scenes", { experience: "osct", scenes: ["s2"] })).ok).toBe(false);
    expect(seen).toHaveLength(0);
    // 2.x presets and fields are gone
    for (const preset of ["cover", "back", "foldout"]) await expect(rec.call("add_scene", { experience: "osct", preset })).rejects.toThrow();
    await rec.call("add_scene", { experience: "osct", title: "Old", layout: "free", format: "cover" });
    expect(seen.at(-1)!.body).toEqual({});
    seen.length = 0;
    const plan = await rec.call("move_scenes", { experience: "osct", scenes: ["s2"], position: 0 });
    expect(plan.data.applied).toBe(false);
    expect(plan.data.next).toContain("apply: true");
    const applied = await rec.call("move_scenes", { experience: "osct", scenes: ["s2"], position: 0, apply: true });
    expect(applied.data.applied).toBe(true);
    expect(applied.data.next).toBeUndefined();
    expect(seen.at(-1)).toMatchObject({ path: "/editor/experiences/osct/scenes/move", body: { scenes: ["s2"], position: 0, apply: true } });
    const out = await rec.call("move_scenes", { experience: "osct", scenes: ["s2"], group: null });
    expect(seen.at(-1)!.body).toEqual({ scenes: ["s2"], group: null });
    expect(out.ok).toBe(true);
    const put = await rec.call("put_scene", { experience: "osct", scene: "s2", label: "Zwei", group: null });
    expect(put.data.scene).toMatchObject({ id: "s2", label: "Zwei" });
    expect(seen.at(-1)).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/scenes/s2", body: { label: "Zwei", group: null } });
    expect(put.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    expect((await rec.call("put_scene", { experience: "osct", scene: "s2", apply: true })).ok).toBe(false);
    await expect(rec.call("put_scene", { experience: "osct", scene: "s2", surfaces: [] })).rejects.toThrow();
    await expect(rec.call("put_scene", { experience: "osct", scene: "s2", label: null })).rejects.toThrow();
    const group = await rec.call("group_scenes", { experience: "osct", label: "Chapter", scenes: ["s1", "s2"] });
    expect(group.data.plan.group).toEqual({ id: "chapter", label: "Chapter" });
    expect(group.data.next).toContain("apply: true");
    expect((await rec.call("rename_group", { experience: "osct", group: "chapter", label: "One" })).data.group).toEqual({ id: "chapter", label: "One" });
    expect((await rec.call("ungroup", { experience: "osct", group: "chapter" })).data).toMatchObject({ ungrouped: "chapter", scenes: ["s1", "s2"] });
  });

  it("put_scene: surfaces with their place; surfaces in use go only with apply, after the person's yes", async () => {
    const placed = await rec.call("put_scene", { experience: "osct", scene: "s2", surfaces: [{ id: "left", widthMm: 230, heightMm: 320 }, { id: "wall", label: "Wall", widthMm: 2000, heightMm: 1500, place: { x: 0, y: 750, z: -400, rx: 90 } }] });
    expect(placed.ok, JSON.stringify(placed.data)).toBe(true);
    expect(seen.at(-1)!.body).toEqual({ surfaces: [{ id: "left", widthMm: 230, heightMm: 320 }, { id: "wall", label: "Wall", widthMm: 2000, heightMm: 1500, place: { x: 0, y: 750, z: -400, rx: 90 } }] });
    expect(placed.data.cleared).toEqual({ entries: [], targets: [] });
    // A place needs x, y, z; a size is required; no side, no layout
    await expect(rec.call("put_scene", { experience: "osct", scene: "s2", surfaces: [{ id: "wall", widthMm: 10, heightMm: 10, place: { x: 0, y: 0 } }] })).rejects.toThrow();
    await expect(rec.call("put_scene", { experience: "osct", scene: "s2", surfaces: [{ id: "wall" }] })).rejects.toThrow();
    await expect(rec.call("put_scene", { experience: "osct", scene: "s2", surfaces: [{ id: "left", side: "left", widthMm: 230, heightMm: 320 }] })).rejects.toThrow();
    const surfaces = [{ id: "surface", widthMm: 460, heightMm: 320 }];
    const inUse = await rec.call("put_scene", { experience: "osct", scene: "s2", surfaces });
    expect(inUse.ok).toBe(false);
    expect(inUse.data.error).toMatchObject({ status: 409, code: "surfaces-in-use", entries: ["castle"], targets: ["castle-target"] });
    expect(inUse.data.error.hint).toMatch(/show the person.*apply: true/);
    const cleared = await rec.call("put_scene", { experience: "osct", scene: "s2", surfaces, apply: true });
    expect(seen.at(-1)!.body).toEqual({ surfaces, apply: true });
    expect(cleared.data.cleared).toEqual({ entries: ["castle"], targets: ["castle-target"] });
  });

  it("put_surface (#314): one surface added, changed, moved or removed – the scene's whole list sent, without the reference", async () => {
    const added = await rec.call("put_surface", { experience: "osct", scene: "s2", surface: "wall", preset: "wall", label: "Wall", place: { x: 0, y: 750, z: -400, rx: 90 } });
    expect(added.ok, JSON.stringify(added.data)).toBe(true);
    expect(added.data.done).toBe("added");
    expect(seen.at(-2)).toMatchObject({ method: "GET", path: "/editor/experiences/osct/scenes" });
    expect(seen.at(-1)).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/scenes/s2" });
    expect(seen.at(-1)!.body).toEqual({ surfaces: [
      { id: "left", widthMm: 230, heightMm: 320, place: { ...PLACE, x: -115 } },
      { id: "right", widthMm: 230, heightMm: 320, place: { ...PLACE, x: 115 } },
      { id: "wall", label: "Wall", widthMm: 2000, heightMm: 1500, place: { x: 0, y: 750, z: -400, rx: 90 } },
    ] });
    await rec.call("put_surface", { experience: "osct", scene: "s2", surface: "right", preset: "double", position: 0 });
    expect((seen.at(-1)!.body as any).surfaces.map((s: { id: string; widthMm: number }) => `${s.id}:${s.widthMm}`)).toEqual(["right:460", "left:230"]);
    // Removing a surface in use: the API's 409 with the hint, then apply after the person's yes
    const inUse = await rec.call("put_surface", { experience: "osct", scene: "s2", surface: "left", remove: true });
    expect(inUse.data.error).toMatchObject({ status: 409, code: "surfaces-in-use" });
    expect(inUse.data.error.hint).toMatch(/put_surface.*apply: true/);
    const removed = await rec.call("put_surface", { experience: "osct", scene: "s2", surface: "left", remove: true, apply: true });
    expect(removed.data).toMatchObject({ done: "removed", cleared: { entries: ["castle"], targets: ["castle-target"] } });
    expect(seen.at(-1)!.body).toEqual({ surfaces: [{ id: "right", widthMm: 230, heightMm: 320, place: { ...PLACE, x: 115 } }], apply: true });
    // Refused before anything is written: a new surface without a size, an unknown scene, remove with fields
    const writes = seen.length;
    expect((await rec.call("put_surface", { experience: "osct", scene: "s2", surface: "new" })).data.error.message).toMatch(/needs its size/);
    expect((await rec.call("put_surface", { experience: "osct", scene: "nope", surface: "x", preset: "single" })).data.error.message).toMatch(/no scene "nope"/);
    expect((await rec.call("put_surface", { experience: "osct", scene: "s2", surface: "left", remove: true, label: "x" })).ok).toBe(false);
    expect(seen.slice(writes).every(s => s.method === "GET")).toBe(true);
  });

  it("the 2.x tools are gone: no spreads, pages, page images, matter or old migrations", () => {
    expect([...rec.tools.keys()].filter(name => /spread|page|matter|migrate/.test(name))).toEqual([]);
  });

  it("describe_content_model explains an entry's Markdown and variables, the experience with its printed book and that the onboarding is the app's (#223, #236, #320)", async () => {
    const model = (await rec.call("describe_content_model", {})).data;
    expect(model.contentSchema).toBe("6.0");
    expect(model.spread).toBeUndefined();
    expect(model.book).toBeUndefined();
    expect(model.experience.description).toContain("book = BookData { author, publisher? }");
    expect(model.experience.description).not.toMatch(/sourceOfTruth/);
    expect(model.experience.sourcesOfTruth).toBeUndefined();
    expect(model.pageImages).toBeUndefined();
    expect(model.scene.presets).toEqual(["double", "single", "wall"]);
    expect(model.scene.description).toMatch(/place: \{ x, y, z, rx, ry, rz \}/);
    expect(model.entry.description).toMatch(/scene, surface\?/);
    expect(model.target.place.description).toMatch(/\{ surface\?, x, y, width, height\? \}/);
    expect(model.entity.assets.textures).toMatch(/512, 1024, 2048, 4096/);
    expect(model.entryText.description).toMatch(/\*emphasis\*/);
    expect(model.entryText.description).toMatch(/\{hasKey\}/);
    expect(model.tutorial).toBeUndefined();
    expect(model.onboarding.description).toMatch(/app's own/);
  });

  it("delete_entry: first the impact and a confirmation, nothing removed; then with confirm (#198)", async () => {
    seen.length = 0;
    const first = await rec.call("delete_entry", { experience: "osct", entry: "castle" });
    expect(first.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "DELETE", path: "/editor/experiences/osct/entries/castle" });
    expect(seen[0].body).toBeUndefined();
    expect(first.data).toMatchObject({ deleted: false, impact: { kind: "entry", counts: { targets: 1, filesOnlyHere: 1 } }, confirmation: { id: CONFIRMATION }, open: "http://localhost:5175/editor/osct/" });
    expect(first.data.next).toMatch(/Show the person the impact.*ask.*confirm: confirmation\.id.*deleteFiles: true only if they asked/);
    const second = await rec.call("delete_entry", { experience: "osct", entry: "castle", confirm: first.data.confirmation.id });
    expect(seen[1].body).toEqual({ confirm: CONFIRMATION });
    expect(second.data).toMatchObject({ deleted: { entries: ["castle"], files: [] }, open: "http://localhost:5175/editor/osct/" });
    const withFiles = await rec.call("delete_entry", { experience: "osct", entry: "castle", confirm: CONFIRMATION, deleteFiles: true });
    expect(seen[2].body).toEqual({ confirm: CONFIRMATION, deleteFiles: true });
    expect(withFiles.data.deleted.files).toEqual(["a1"]);
    const stale = await rec.call("delete_entry", { experience: "osct", entry: "castle", confirm: "1900000000.ffffffffffffffffffffffffffffffff" });
    expect(stale.data).toMatchObject({ deleted: false, void: "The confirmation is void.", impact: { kind: "entry" }, confirmation: { id: CONFIRMATION } });
    const early = await rec.call("delete_entry", { experience: "osct", entry: "castle", deleteFiles: true });
    expect(early.ok).toBe(false);
    expect(seen).toHaveLength(4);
  });

  it("the removal tools tell the agent to show the impact and ask before confirming (#198)", () => {
    for (const tool of ["delete_scene", "delete_entry"]) {
      const description = rec.tools.get(tool)?.config.description ?? "";
      expect(description).toMatch(/two steps/);
      expect(description).toMatch(/Show the impact to the person and ask; only with their yes call again with the same arguments and `confirm: <confirmation.id>`/);
      expect(description).toMatch(/deleteFiles: true.*only when the person asked/);
    }
  });

  it("describes the files' own numbers an agent sizes and times a node by (#91)", () => {
    expect(rec.tools.get("list_assets")?.config.description).toMatch(/width \/ height.*durationMs/);
    expect(rec.tools.get("upload_asset")?.config.description).toContain("durationMs");
  });

  it("assets: list by kind, upload a local file with its name, delete refused while in use unless forced", async () => {
    expect((await rec.call("list_assets", { experience: "osct", kind: "image" })).data.query).toBe("/editor/experiences/osct/assets?kind=image");
    const dir = mkdtempSync(join(tmpdir(), "osct-mcp-"));
    const file = join(dir, "Dot.png");
    writeFileSync(file, Buffer.from([137, 80, 78, 71]));
    const uploaded = await rec.call("upload_asset", { experience: "osct", file });
    expect(uploaded.ok).toBe(true);
    expect(uploaded.data.asset.name).toBe("Dot.png");
    expect(uploaded.data.size).toBe(4);
    expect(uploaded.data.path).toBe("/editor/experiences/osct/assets");
    const renamed = await rec.call("upload_asset", { experience: "osct", file, name: "dot-1x1.png" });
    expect(renamed.data.asset.name).toBe("dot-1x1.png");
    // #298: a target's printed image names its use – the API cuts it to 1200 px; the rule is in the description
    expect((await rec.call("upload_asset", { experience: "osct", file, fit: "target" })).data.path).toBe("/editor/experiences/osct/assets?fit=target");
    // Named by its use (#298 phase 3)
    expect((await rec.call("upload_asset", { experience: "osct", file, fit: "target", entry: "p118-1" })).data.path).toBe("/editor/experiences/osct/assets?fit=target&entry=p118-1");
    expect((await rec.call("upload_asset", { experience: "osct", file, fit: "reference", scene: "s2", surface: "left" })).data.path).toBe("/editor/experiences/osct/assets?fit=reference&scene=s2&surface=left");
    expect((await rec.call("upload_asset", { experience: "osct", file, fit: "reference", scene: "s2" })).ok).toBe(false);
    await expect(rec.call("upload_asset", { experience: "osct", file, fit: "page", page: 118 })).rejects.toThrow();
    await expect(rec.call("upload_asset", { experience: "osct", file, fit: "poster" })).rejects.toThrow(/fit/);
    expect(rec.tools.get("upload_asset")?.config.description).toMatch(/WebP.*1200 px/s);
    const missing = await rec.call("upload_asset", { experience: "osct", file: join(dir, "nope.png") });
    expect(missing.ok).toBe(false);
    const inUse = await rec.call("delete_asset", { experience: "osct", asset: "11111111-1111-4111-8111-111111111111" });
    expect(inUse.ok).toBe(false);
    expect(inUse.data.error).toMatchObject({ code: "asset-in-use", usages: [{ kind: "target", ref: "racoon" }] });
    expect(inUse.data.error.hint).toContain("force");
    expect((await rec.call("delete_asset", { experience: "osct", asset: "11111111-1111-4111-8111-111111111111", force: true })).ok).toBe(true);
  });

  it("set_asset_credits sends the lines by url (#277)", async () => {
    const items = [{ url: "https://cdn/a.jpg", credits: "Book Golem by TER-JAN / DeviantArt" }, { url: "https://cdn/b.jpg", credits: null }];
    const saved = await rec.call("set_asset_credits", { experience: "osct", items });
    expect(saved.ok).toBe(true);
    expect(saved.data.sent).toEqual({ items });
  });

  it("rename_asset sends one file's name by its id – an upload's or an imported one's (#330)", async () => {
    const renamed = await rec.call("rename_asset", { experience: "osct", asset: "11111111-1111-4111-8111-111111111111", name: "Desk photo" });
    expect(renamed.ok).toBe(true);
    expect(renamed.data.sent).toEqual({ name: "Desk photo" });
    expect(renamed.data.path).toBe("/editor/experiences/osct/assets/11111111-1111-4111-8111-111111111111");
    expect((await rec.call("rename_asset", { experience: "osct", asset: "import-0123456789abcdef", name: "page" })).data.path).toBe("/editor/experiences/osct/assets/import-0123456789abcdef");
    await expect(rec.call("rename_asset", { experience: "osct", asset: "../credits", name: "x" })).rejects.toThrow();
  });

  it("plan_asset_names answers the plan only, apply_asset_names writes it (#298)", async () => {
    const plan = await rec.call("plan_asset_names", { experience: "osct" });
    expect(plan.data.applied).toBe(false);
    expect(plan.data.sent).toEqual({ apply: false });
    expect(plan.data.plan.renames[0].to).toBe("cover_surface.webp");
    expect(plan.data.hint).toContain("apply_asset_names");
    expect((rec.tools.get("plan_asset_names")?.config.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint).toBe(true);
    const applied = await rec.call("apply_asset_names", { experience: "osct" });
    expect(applied.data.applied).toBe(true);
    expect(applied.data.sent).toEqual({ apply: true });
  });

  it("get_draft: the manifest, the configuration, the files", async () => {
    expect((await rec.call("get_draft", { experience: "osct", part: "manifest" })).data.build).toBe("abcdef012345");
    const configuration = await rec.call("get_draft", { experience: "osct" });
    expect(configuration.data.configuration.plugins[0].id).toBe("tint");
    expect((await rec.call("get_draft", { experience: "osct", part: "files" })).data.files["/m.glb"]).toEqual({ size: 1 });
  });

  it("describe_content_model: the contract, and with an experience its plugins and Code tab sources", async () => {
    const plain = await rec.call("describe_content_model");
    expect(plain.data.entity.nodeTypes).toContain("model");
    expect(seen).toHaveLength(0);
    const experience = await rec.call("describe_content_model", { experience: "osct" });
    expect(experience.data.components.declaredPlugins).toEqual([{ id: "tint", src: "/p.js", api: "1.2", recorded: true }]);
    expect(experience.data.components.plugins.tint).toMatchObject({ plugin: "tint", params: { opacity: { min: 0, max: 1 } } });
    expect(experience.data.entity.pluginNodeTypes.recorded.sparkle).toMatchObject({ plugin: "tint", params: { count: { max: 500 } } });
    expect(experience.data.entity.pluginNodeTypes.known).toEqual(["sparkle", "beam"]);
    expect(experience.data.components.codeTabSources).toEqual([{ id: "glow", components: [], layers: ["glow"], nodeTypes: ["beam"], passes: [], materials: [], textures: [], appearances: ["popIn"] }]);
  });

  it("put_scene: the scene's own passes, checked before they are sent", async () => {
    const ok = await rec.call("put_scene", { experience: "osct", scene: "s2", passes: [{ type: "bloom", strength: 1.5 }] });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/scenes/s2", body: { passes: [{ type: "bloom", strength: 1.5 }] } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/s2/");
    const off = await rec.call("put_scene", { experience: "osct", scene: "s2", passes: null });
    expect(seen[1].body).toEqual({ passes: null });
    expect(off.ok).toBe(true);
    seen.length = 0;
    const bad = await rec.call("put_scene", { experience: "osct", scene: "s2", passes: [{ type: "bloom", strength: 9 }, { type: "glow" }] });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.code).toBe("invalid-passes");
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^passes\[0\]\.strength/), expect.stringMatching(/^passes\[1\]\.type: "glow" is not one of bloom, vignette, grade or a pass of the experience's plugins \(scanLines\)/)]);
    expect((await rec.call("put_scene", { experience: "osct", scene: "s2" })).ok).toBe(false);
    // Only the experience's plugins were read (a type that is not built in): nothing was written
    expect(seen.filter(s => s.method !== "GET")).toHaveLength(0);
  });

  it("put_scene and put_experience_passes take a plugin's pass the experience's plugins recorded (#216), checked against its spec", async () => {
    const ok = await rec.call("put_scene", { experience: "osct", scene: "s2", passes: [{ type: "vignette" }, { type: "scanLines", lines: 300 }] });
    expect(ok.ok).toBe(true);
    expect(ok.data.warnings).toBeUndefined();
    expect(seen.find(s => s.method === "PUT")).toMatchObject({ path: "/editor/experiences/osct/scenes/s2", body: { passes: [{ type: "vignette" }, { type: "scanLines", lines: 300 }] } });
    seen.length = 0;
    const bad = await rec.call("put_experience_passes", { experience: "osct", passes: [{ type: "scanLines", lines: 9000 }] });
    expect(bad.data.error.problems).toEqual(["passes[0].lines: expected a number from 10 to 800, got 9000"]);
    expect(seen.filter(s => s.method !== "GET")).toHaveLength(0);
    // Built-in passes alone: the experience's plugins are not read
    seen.length = 0;
    await rec.call("put_experience_passes", { experience: "osct", passes: [{ type: "bloom" }] });
    expect(seen.map(s => s.method)).toEqual(["PUT"]);
  });

  it("delete_scene: the impact first, then with confirm everything on it goes; the opening scene is refused (#198)", async () => {
    const first = await rec.call("delete_scene", { experience: "osct", scene: "s2" });
    expect(first.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "DELETE", path: "/editor/experiences/osct/scenes/s2" });
    expect(first.data).toMatchObject({ deleted: false, impact: { kind: "scene", scene: { id: "s2", label: "Two" }, counts: { entries: 2 }, keptEntities: [{ ref: "castle" }] }, confirmation: { id: CONFIRMATION } });
    expect(first.data.next).toContain("call delete_scene again");
    const second = await rec.call("delete_scene", { experience: "osct", scene: "s2", confirm: first.data.confirmation.id });
    expect(second.data).toMatchObject({ deleted: { scene: "s2", entries: ["castle", "text"] }, open: "http://localhost:5175/editor/osct/" });
    const opening = await rec.call("delete_scene", { experience: "osct", scene: "s1" });
    expect(opening.ok).toBe(false);
    expect(opening.data.error).toMatchObject({ status: 409, code: "initial-scene" });
    expect(opening.data.error.hint).toContain("cannot be removed");
  });

  it("put_experience_appearance: a look per moment, checked against the contract; null removes it (#265)", async () => {
    const looks = { reveal: { type: "inflateDissolve" }, found: { type: "printLift", duration: 900 }, lost: { type: "fade" } };
    const ok = await rec.call("put_experience_appearance", { experience: "osct", appearance: looks });
    expect(ok.ok).toBe(true);
    // Built-in looks alone: the experience's plugins are not read
    expect(seen.map(s => s.method)).toEqual(["PUT"]);
    expect(seen[0]).toMatchObject({ path: "/editor/experiences/osct/appearance", body: { appearance: looks } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    expect((await rec.call("put_experience_appearance", { experience: "osct", appearance: null })).data.appearance).toBeNull();
    seen.length = 0;
    const bad = await rec.call("put_experience_appearance", { experience: "osct", appearance: { found: { type: "fade", duration: 20 }, lost: { type: "fade", mask: "stars" } } });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.code).toBe("invalid-appearance");
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^appearance\.found\.duration: expected a number from 50/), expect.stringMatching(/^appearance\.lost\.mask: expected one of none, noise/)]);
    expect(seen).toHaveLength(0);
    // A moment the contract does not have is refused by the tool's input schema before anything is sent
    await expect(rec.call("put_experience_appearance", { experience: "osct", appearance: { unlock: { type: "fade" } } })).rejects.toThrow(/unlock|Unrecognized/);
  });

  it("put_experience_appearance takes a plugin's look: recorded ones checked against their spec, a Code tab source's with a warning (#265)", async () => {
    const ok = await rec.call("put_experience_appearance", { experience: "osct", appearance: { found: { type: "softFade", duration: 500 } } });
    expect(ok.ok).toBe(true);
    expect(ok.data.warnings).toBeUndefined();
    expect(seen.find(s => s.method === "PUT")).toMatchObject({ path: "/editor/experiences/osct/appearance", body: { appearance: { found: { type: "softFade", duration: 500 } } } });
    seen.length = 0;
    const bad = await rec.call("put_experience_appearance", { experience: "osct", appearance: { found: { type: "softFade", duration: 5 } } });
    expect(bad.data.error.problems).toEqual(["appearance.found.duration: expected a number from 50 to 10000, got 5"]);
    expect(seen.filter(s => s.method !== "GET")).toHaveLength(0);
    const fromSource = await rec.call("put_experience_appearance", { experience: "osct", appearance: { reveal: { type: "popIn" } } });
    expect(fromSource.ok).toBe(true);
    expect(fromSource.data.warnings).toEqual([expect.stringContaining("popIn")]);
    const typo = await rec.call("put_experience_appearance", { experience: "osct", appearance: { reveal: { type: "popin" } } });
    expect(typo.data.error.problems).toEqual([expect.stringMatching(/^appearance\.reveal\.type: "popin" is not one of inflateDissolve, printLift, fade or a look of the experience's plugins \(softFade, popIn\)/)]);
  });

  it("put_experience_passes: the experience's master chain, checked; null removes it", async () => {
    const ok = await rec.call("put_experience_passes", { experience: "osct", passes: [{ type: "vignette", strength: 0.4 }, { type: "grade", reach: "all" }] });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/passes", body: { passes: [{ type: "vignette", strength: 0.4 }, { type: "grade", reach: "all" }] } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    expect((await rec.call("put_experience_passes", { experience: "osct", passes: null })).data.passes).toBeNull();
    seen.length = 0;
    const bad = await rec.call("put_experience_passes", { experience: "osct", passes: [{ type: "grade", reach: "camera" }] });
    expect(bad.data.error.problems).toEqual([expect.stringMatching(/^passes\[0\]\.reach: expected one of ar, all/)]);
    expect(seen).toHaveLength(0);
  });

  it("put_experience_passes and put_scene take a pass that is off (enabled: false, #233); enabled is a boolean", async () => {
    const off = [{ type: "bloom", enabled: false, strength: 0.35 }, { type: "vignette" }];
    expect((await rec.call("put_experience_passes", { experience: "osct", passes: off })).ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/passes", body: { passes: off } });
    seen.length = 0;
    expect((await rec.call("put_scene", { experience: "osct", scene: "s2", passes: off })).ok).toBe(true);
    expect(seen.find(s => s.method === "PUT")).toMatchObject({ path: "/editor/experiences/osct/scenes/s2", body: { passes: off } });
    seen.length = 0;
    // The tool's input schema refuses another type before anything is sent
    await expect(rec.call("put_experience_passes", { experience: "osct", passes: [{ type: "bloom", enabled: "no" }] })).rejects.toThrow(/enabled/);
    expect(seen).toHaveLength(0);
  });

  it("put_environment: the world, the onion sky and their assets, checked; null removes it", async () => {
    const environment = { world: "cafe", onionSky: false, worldSrc: "http://api.test/api/content/assets/osct/w/room.glb" };
    const ok = await rec.call("put_environment", { experience: "osct", environment });
    expect(ok.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/environment", body: { environment } });
    expect(ok.data.open).toBe("http://localhost:5175/editor/osct/");
    expect((await rec.call("put_environment", { experience: "osct", environment: null })).data.environment).toBeNull();
    seen.length = 0;
    const bad = await rec.call("put_environment", { experience: "osct", environment: { world: "cafe", onionSky: true, skySrc: "http://x/sky.glb" } });
    expect(bad.ok).toBe(false);
    expect(bad.data.error.problems[0]).toMatch(/skySrc must be an equirectangular image/);
    expect(seen).toHaveLength(0);
    await expect(rec.call("put_environment", { experience: "osct", environment: { world: "forest", onionSky: true } })).rejects.toThrow();
  });

  it("publish: to the instance's own environment (the default), its store and warning in the answer; another env is the API's 403; production is refused without a publish (#183)", async () => {
    const own = await rec.call("publish", { experience: "osct", note: "check" });
    expect(own.ok).toBe(true);
    expect(seen.map(s => `${s.method} ${s.path}`)).toEqual(["GET /editor/environments", "POST /editor/experiences/osct/publish"]);
    expect(seen[1].body).toEqual({ env: "local", note: "check" });
    expect(own.data).toMatchObject({ env: "local", store: "server", warning: expect.stringContaining("No CDN connected") });
    const staging = await rec.call("publish", { experience: "osct", env: "staging" });
    expect(staging.ok).toBe(false);
    expect(staging.data.error).toMatchObject({ status: 403, code: "other-environment", env: "local", hint: expect.stringContaining("own environment only") });
    seen.length = 0;
    const production = await rec.call("publish", { experience: "osct", env: "production" });
    expect(production.ok).toBe(false);
    expect(production.data.error.code).toBe("production-is-a-person");
    expect(production.data.open).toBe("http://localhost:5175/editor/osct/");
    expect(seen.filter(s => s.method === "POST")).toHaveLength(0);
  });

  it("the logs", async () => {
    expect((await rec.call("list_versions", { experience: "osct" })).data.versions[0].env).toBe("local");
    expect((await rec.call("list_changes", { experience: "osct", limit: 5 })).data.limit).toBe("/editor/experiences/osct/changes?limit=5");
    expect((await rec.call("list_changes", { experience: "osct" })).data.limit).toBe("/editor/experiences/osct/changes");
  });

  it("revert_change and revert_to: the plan first, written only with apply (#312)", async () => {
    const plan = await rec.call("revert_change", { experience: "osct", change: "c1" });
    expect(seen.at(-1)).toMatchObject({ method: "POST", path: "/editor/experiences/osct/changes/c1/revert", body: {} });
    expect(plan.data.applied).toBe(false);
    expect(plan.data.next).toMatch(/apply: true/);
    const done = await rec.call("revert_change", { experience: "osct", change: "c1", apply: true });
    expect(seen.at(-1)?.body).toEqual({ apply: true });
    expect(done.data.written).toEqual(["c2"]);
    expect(done.data.next).toBeUndefined();
    await rec.call("revert_to", { experience: "osct", after: "c0" });
    expect(seen.at(-1)).toMatchObject({ method: "POST", path: "/editor/experiences/osct/changes/revert-to", body: { after: "c0" } });
    await rec.call("revert_to", { experience: "osct", after: "c0", apply: true });
    expect(seen.at(-1)?.body).toEqual({ after: "c0", apply: true });
  });

  it("import_experience: a configuration, the cdn, or neither", async () => {
    const result = await rec.call("import_experience", { experience: "osct", configuration: { experience: { id: "osct" } }, assetsBase: "http://localhost:5174" });
    expect(result.ok).toBe(true);
    expect(seen[0].body).toEqual({ configuration: { experience: { id: "osct" } }, assetsBase: "http://localhost:5174" });
    const cdn = await rec.call("import_experience", { experience: "osct", source: "cdn" });
    expect(seen[1].body).toEqual({ source: "cdn" });
    expect(cdn.ok).toBe(true);
    expect((await rec.call("import_experience", { experience: "osct" })).ok).toBe(false);
  });

  it("preview_import: what an import would bring in, nothing imported – the experience, its build and the draft it replaces (#182)", async () => {
    const cdn = await rec.call("preview_import", { source: "cdn" });
    expect(cdn.ok).toBe(true);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/editor/import/preview", body: { source: "cdn" } });
    expect(cdn.data).toMatchObject({ imported: false, contentBase: "https://cdn.example/demo", incoming: { experience: "demo", build: "7457f0c10df1" }, counts: { scenes: 6 }, existing: { draft: { edits: 3 } }, open: "http://localhost:5175/editor/demo/" });
    expect(cdn.data.next).toContain("1 experience, “The Demo Experience” (demo), build 7457f0c10df1 – it replaces the draft");
    expect(cdn.data.next).toContain('import_experience with experience: "demo"');
    const fresh = await rec.call("preview_import", { configuration: { experience: { id: "fresh" } }, assetsBase: "http://localhost:5174" });
    expect(seen[1].body).toEqual({ configuration: { experience: { id: "fresh" } }, assetsBase: "http://localhost:5174" });
    expect(fresh.data.existing).toBeNull();
    expect(fresh.data.open).toBeUndefined();
    expect(fresh.data.next).toContain("a new experience");
    expect((await rec.call("preview_import", {})).ok).toBe(false);
    expect(seen.some(s => s.path.endsWith("/import"))).toBe(false);
  });

  it("import_experience over an existing experience: first the comparison and a confirmation, nothing imported; then with confirm (#183)", async () => {
    const configuration = { experience: { id: "demo" } };
    const first = await rec.call("import_experience", { experience: "demo", configuration });
    expect(first.ok).toBe(true);
    expect(first.data).toMatchObject({ imported: false, comparison: { incoming: { build: "cdcdcdcdcdcd" }, draft: { basedOn: { build: "abababababab" }, edits: 3 } }, confirmation: { id: "1900000000.0123456789abcdef0123456789abcdef" } });
    expect(first.data.next).toMatch(/show the person the comparison/i);
    expect(seen[0].body).toEqual({ configuration });
    const second = await rec.call("import_experience", { experience: "demo", configuration, confirm: first.data.confirmation.id });
    expect(seen[1].body).toEqual({ configuration, confirm: "1900000000.0123456789abcdef0123456789abcdef" });
    expect(second.ok).toBe(true);
    expect(second.data).toMatchObject({ counts: { scenes: 2 }, imported: { build: "cdcdcdcdcdcd" }, open: "http://localhost:5175/editor/demo/" });
    const stale = await rec.call("import_experience", { experience: "demo", configuration, confirm: "1900000000.ffffffffffffffffffffffffffffffff" });
    expect(stale.data).toMatchObject({ imported: false, void: "The confirmation is void.", confirmation: { id: expect.any(String) } });
  });

  it("API errors come back as the API's { code, message } with a hint", async () => {
    const fake = fakeFetch(() => ({ status: 403, json: { error: { code: "forbidden", message: "Not allowed.", role: "editor" } } }));
    const r = recorder();
    registerContentTools(r.server, fake.api(), LINKS);
    const result = await r.call("list_experiences");
    expect(result.ok).toBe(false);
    expect(result.data.error).toMatchObject({ status: 403, code: "forbidden", message: "Not allowed.", role: "editor" });
    expect(result.data.error.hint).toContain("editor");
  });

  it("surface reference images (#314): set, change the fit, remove", async () => {
    const set = await rec.call("set_surface_reference", { experience: "osct", scene: "s2", surface: "left", url: "/a.png", fit: "contain" });
    expect(set.data.reference).toEqual({ url: "/a.png", name: "a.png", fit: "contain" });
    expect(seen.at(-1)).toMatchObject({ method: "PUT", path: "/editor/experiences/osct/scenes/s2/surfaces/left/reference", body: { url: "/a.png", fit: "contain" } });
    expect(set.data.open).toBeDefined();
    await rec.call("set_surface_reference", { experience: "osct", scene: "s2", surface: "left", url: null });
    expect(seen.at(-1)!.body).toEqual({ url: null });
    seen.length = 0;
    expect((await rec.call("set_surface_reference", { experience: "osct", scene: "s2", surface: "left" })).ok).toBe(false);
    expect(seen).toHaveLength(0);
    await expect(rec.call("set_surface_reference", { experience: "osct", scene: "s2", surface: "left", fit: "tile" })).rejects.toThrow();
    expect((await rec.call("set_surface_reference", { experience: "osct", scene: "s2", surface: "left", fit: "stretch" })).data.reference.fit).toBe("stretch");
  });
});

describe("publish refusals", () => {
  it("every code the publish can refuse with has a hint, and the publish tool's description names it", () => {
    const rec = recorder();
    registerContentTools(rec.server, fakeFetch(() => undefined).api(), LINKS);
    const description = String(rec.tools.get("publish")?.config.description);
    for (const code of PUBLISH_REFUSALS) {
      const status = code === "not-for-ai" || code === "other-environment" ? 403 : code === "not-found" ? 404 : 409;
      expect(hintFor(new ApiError(status, code, "refused")), code).not.toBe("");
      expect(description, code).toContain(code);
    }
  });
});
