// The editor's content tools over the API (`/api/editor/*`, docs/server.md "Editor data", "Assets"): the book's tree
// and spreads, entities and targets, entries, assets, the draft, publishing to local / staging, the logs. Every write
// is checked against the shared content contract first and answers with the editor's link, where the person checks
// the draft on the stage. Production stays with the person – the tool refuses it.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import { checkEntity, describeContentModel, pluginTypes, type BookModel } from "./model.ts";
import { fail, guard, text } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import type { EntityData, EntityRefData, PluginData, PrintPlacement } from "../../shared/types/game-config";
import { PRINT_SURFACES } from "../../shared/types/game-config";

type Json = Record<string, unknown>;

/** The book list's rows (`GET /editor/books`) */
export interface BookSummary {
  id: string;
  title: string;
  author: string;
  spreads: number;
  schema?: string;
  updatedAt?: string;
  lastPublish?: { env: string; build: string; at: string } | null;
}

export interface TreeTarget {
  id: string;
  imageSrc: string;
  entity?: EntityData | EntityRefData;
  print?: PrintPlacement;
}

export interface TreeEntry {
  id: string;
  title: string;
  category: string;
  page: number;
  target: TreeTarget | null;
}

export interface TreeSpread {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  format?: string;
  entries: TreeEntry[];
}

export interface BookTree {
  book: BookSummary & Json;
  spreads: TreeSpread[];
  unassigned?: TreeEntry[];
}

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "letters, digits, _ and -, at most 64");
const BOOK = ID.describe("the book's id (list_books)");
const entitySchema = z.record(z.string(), z.unknown()).describe("EntityData – the node tree (describe_content_model)");
const printSchema = z
  .object({
    surface: z.enum(PRINT_SURFACES),
    x: z.number().describe("mm from the surface's left edge"),
    y: z.number().describe("mm from the surface's top edge"),
    width: z.number().positive().describe("the printed width in mm"),
    height: z.number().positive().optional(),
    page: z.number().int().optional(),
  })
  .describe("where the target is printed (PrintPlacement)");

const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** The guard's verdict as a tool error, or null when the entity may be sent */
function refuseInvalid(entity: unknown, path = "entity") {
  const check = checkEntity(entity, path);
  if (check.problems.length === 0) return null;
  return fail({
    error: { code: "invalid-entity", message: `${path} does not match the content contract (nothing was sent).`, problems: check.problems },
    hint: "describe_content_model lists the node types, placement, filters and components.",
  });
}

const warnings = (entity: unknown) => {
  const unknown = checkEntity(entity).unknownComponents;
  return unknown.length ? { warnings: [`component types no built-in provides: ${unknown.join(", ")} – a plugin must register them, else the publish is refused`] } : {};
};

export function registerContentTools(server: McpServer, api: OsctApi, links: AppLinks): void {
  const tree = (book: string) => api.call<BookTree>("GET", `/editor/books/${encodeURIComponent(book)}`);
  const entities = (book: string) => api.call<{ entities: Record<string, EntityData> }>("GET", `/editor/books/${encodeURIComponent(book)}/entities`);
  const draft = async (book: string) => {
    const manifest = await api.call<{ build: string; hash: string }>("GET", `/editor/books/${encodeURIComponent(book)}/draft/latest.json`);
    const configuration = await api.call<Json & { plugins?: PluginData[] }>("GET", `/editor/books/${encodeURIComponent(book)}/draft/${manifest.build}/game.config.json`);
    return { manifest, configuration };
  };
  /** the spread an entry's page belongs to – for the link of a target write */
  const spreadOf = (t: BookTree, targetId: string) => t.spreads.find(s => s.entries.some(e => e.target?.id === targetId))?.id ?? null;

  // ── reading ──

  server.registerTool(
    "list_books",
    { description: "The instance's books: id, title, author, number of spreads, content schema, last publish – and the editor's link of each.", inputSchema: z.object({}), annotations: read },
    guard(async () => {
      const { books } = await api.call<{ books: BookSummary[] }>("GET", "/editor/books");
      return text({ books: books.map(b => ({ ...b, open: editorHref(links, b.id) })) });
    }),
  );

  server.registerTool(
    "import_book",
    {
      description:
        "Replaces a book's content rows from a game configuration (the content build's game.config.json): `url` fetches it (e.g. the reader's dev server http://localhost:5174/src/game.config.json), or pass `configuration`; `source: \"cdn\"` imports the instance CDN's current version. `assetsBase` = where its /assets/content/… paths resolve. The change and publish logs stay; edits made since are replaced.",
      inputSchema: z.object({
        book: BOOK,
        url: z.string().url().optional().describe("a game.config.json to fetch"),
        configuration: z.record(z.string(), z.unknown()).optional().describe("the game configuration itself"),
        assetsBase: z.string().url().optional().describe("the origin the configuration's /assets/content/… paths resolve against"),
        source: z.enum(["cdn"]).optional().describe('"cdn" = the instance CDN\'s current version (CONTENT_BASE_URL)'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ book, url, configuration, assetsBase, source }) => {
      let body: Json;
      if (source === "cdn") body = { source };
      else {
        if (!url === !configuration) return fail({ error: { code: "mcp", message: "give either url, configuration or source: cdn" } });
        if (url) {
          const response = await fetch(url);
          if (!response.ok) return fail({ error: { code: "fetch-failed", message: `${url} answered ${response.status}` } });
          configuration = (await response.json()) as Json;
        }
        body = { configuration, ...(assetsBase ? { assetsBase } : {}) };
      }
      const result = await api.call<Json>("POST", `/editor/books/${encodeURIComponent(book)}/import`, body);
      return text({ ...result, open: editorHref(links, book) });
    }),
  );

  server.registerTool(
    "get_book",
    {
      description: "A book's tree: the book, its spreads (id, title, pages, format) with their entries (id, title, category, page) and each entry's target (id, imageSrc, print, entity inline or { ref }), plus the entries whose page is in no spread. Shared entities: get_entity.",
      inputSchema: z.object({ book: BOOK }),
      annotations: read,
    },
    guard(async ({ book }) => {
      const t = await tree(book);
      const targets = t.spreads.reduce((n, s) => n + s.entries.filter(e => e.target).length, 0);
      return text({ ...t, counts: { spreads: t.spreads.length, entries: t.spreads.reduce((n, s) => n + s.entries.length, 0) + (t.unassigned?.length ?? 0), targets }, open: editorHref(links, book) });
    }),
  );

  server.registerTool(
    "get_spread",
    {
      description:
        "One spread with its entries and targets, every target's entity resolved: an inline entity as it is, a shared one as the entity under `entity` with its `ref` next to it (put_entity changes the shared entity for every target using it; put_target with `entity` gives the target its own). Pick the spread by `spread` (its id) or by a `page` it holds.",
      inputSchema: z.object({ book: BOOK, spread: ID.optional().describe("the spread's id"), page: z.number().int().optional().describe("a page of the spread") }),
      annotations: read,
    },
    guard(async ({ book, spread, page }) => {
      if (!spread && page === undefined) return fail({ error: { code: "mcp", message: "give spread or page" } });
      const [t, shared] = await Promise.all([tree(book), entities(book)]);
      const found = spread ? t.spreads.find(s => s.id === spread) : t.spreads.find(s => s.firstPage <= page! && page! <= s.lastPage);
      if (!found) return fail({ error: { code: "not-found", message: spread ? `No spread "${spread}" in ${book}.` : `No spread holds page ${page} in ${book}.`, spreads: t.spreads.map(s => ({ id: s.id, pages: [s.firstPage, s.lastPage] })) } });
      const { entries, ...rest } = found;
      const resolved = entries.map(entry => {
        if (!entry.target) return { ...entry, target: null };
        const { entity, ...target } = entry.target;
        if (entity && "ref" in entity) return { ...entry, target: { ...target, ref: entity.ref, entity: shared.entities[entity.ref] ?? null } };
        return { ...entry, target: { ...target, entity: entity ?? null } };
      });
      return text({ spread: rest, entries: resolved, open: editorHref(links, book, found.id) });
    }),
  );

  server.registerTool(
    "get_entity",
    { description: "One shared entity of the book by its ref (EntityData, the node tree); the refs are in get_book's targets ({ ref }).", inputSchema: z.object({ book: BOOK, ref: ID }), annotations: read },
    guard(async ({ book, ref }) => {
      const { entities: all } = await entities(book);
      if (!(ref in all)) return fail({ error: { code: "not-found", message: `No shared entity "${ref}" in ${book}.`, refs: Object.keys(all) } });
      return text({ ref, entity: all[ref] });
    }),
  );

  server.registerTool(
    "get_draft",
    {
      description: "The book's draft as the content version the engine loads: `manifest` (build, hash), `configuration` (the whole game configuration, assembled from the rows now) or `files` (its files.json). Large – prefer get_spread for one spread.",
      inputSchema: z.object({ book: BOOK, part: z.enum(["manifest", "configuration", "files"]).default("configuration") }),
      annotations: read,
    },
    guard(async ({ book, part }) => {
      const manifest = await api.call<{ build: string; hash: string }>("GET", `/editor/books/${encodeURIComponent(book)}/draft/latest.json`);
      if (part === "manifest") return text(manifest);
      const file = part === "files" ? "files.json" : "game.config.json";
      const data = await api.call<Json>("GET", `/editor/books/${encodeURIComponent(book)}/draft/${manifest.build}/${file}`);
      return text({ build: manifest.build, [part]: data });
    }),
  );

  server.registerTool(
    "describe_content_model",
    {
      description:
        "What you may write: node types, placement (units, defaults), filters, components with their parameters, printed placement, entry categories, spread formats – from the shared content contract. With `book`: also the compiled plugins its configuration declares and the Code tab's sources with the component / layer types read from them.",
      inputSchema: z.object({ book: BOOK.optional() }),
      annotations: read,
    },
    guard(async ({ book }) => {
      if (!book) return text(describeContentModel());
      const [{ configuration }, { plugins }] = await Promise.all([draft(book), api.call<{ plugins: { id: string }[] }>("GET", `/editor/books/${encodeURIComponent(book)}/plugins`)]);
      const sources = await Promise.all(
        plugins.map(async p => {
          const { plugin } = await api.call<{ plugin: { id: string; source: string } }>("GET", `/editor/books/${encodeURIComponent(book)}/plugins/${encodeURIComponent(p.id)}`);
          return { id: plugin.id, ...pluginTypes(plugin.source) };
        }),
      );
      const model: BookModel = { declared: configuration.plugins ?? [], sources };
      return text(describeContentModel(model));
    }),
  );

  // ── writing: entities, targets, entries ──

  server.registerTool(
    "put_entity",
    {
      description:
        "Saves (or adds) a shared entity under `ref` – the whole node tree (EntityData: type, assets, params, filters, components, children, text, color; describe_content_model). Checked against the content contract before it is sent; the API records a change. Every target with { ref } shows it.",
      inputSchema: z.object({ book: BOOK, ref: ID.describe("the shared entity's ref"), entity: entitySchema }),
      annotations: write,
    },
    guard(async ({ book, ref, entity }) => {
      const refused = refuseInvalid(entity);
      if (refused) return refused;
      const result = await api.call<{ ref: string; entity: EntityData }>("PUT", `/editor/books/${encodeURIComponent(book)}/entities/${encodeURIComponent(ref)}`, entity);
      return text({ ...result, ...warnings(entity), open: editorHref(links, book) });
    }),
  );

  server.registerTool(
    "put_target",
    {
      description:
        "Changes a target: `entity` = its own AR content (EntityData; null removes it), `ref` = a shared entity instead, `imageSrc` = the printed image (an uploaded image asset's url), `print` = where it is printed (null removes it). Send what changes. Checked against the contract; a change is recorded.",
      inputSchema: z.object({
        book: BOOK,
        target: ID.describe("the target's id (get_spread)"),
        entity: entitySchema.nullable().optional(),
        ref: ID.optional().describe("a shared entity's ref"),
        imageSrc: z.string().min(1).optional(),
        print: printSchema.nullable().optional(),
      }),
      annotations: write,
    },
    guard(async ({ book, target, entity, ref, imageSrc, print }) => {
      const body: Json = {};
      if (ref !== undefined) body.ref = ref;
      else if (entity !== undefined) body.entity = entity;
      if (imageSrc !== undefined) body.imageSrc = imageSrc;
      if (print !== undefined) body.print = print;
      if (Object.keys(body).length === 0) return fail({ error: { code: "mcp", message: "send entity, ref, imageSrc or print" } });
      if (entity) {
        const refused = refuseInvalid(entity);
        if (refused) return refused;
      }
      const [result, t] = await Promise.all([api.call<{ target: TreeTarget }>("PUT", `/editor/books/${encodeURIComponent(book)}/targets/${encodeURIComponent(target)}`, body), tree(book)]);
      return text({ ...result, ...(entity ? warnings(entity) : {}), open: editorHref(links, book, spreadOf(t, target)) });
    }),
  );

  server.registerTool(
    "add_entry",
    {
      description:
        "Makes a new entry with its target on the spread its `page` belongs to: title, page, category (default glossary), body, and the target – `imageSrc` (the printed image: an uploaded image asset's url), `print` (where it is printed, in mm), `entity` (its AR content as a node tree, or { ref }). The id comes from title and page (e.g. p30-shadows) unless given; 409 duplicate-id. The reader tracks the target after a publish.",
      inputSchema: z.object({
        book: BOOK,
        title: z.string().min(1),
        page: z.number().int(),
        category: z.enum(["glossary", "video", "text", "link"]).optional(),
        body: z.string().optional(),
        id: ID.optional(),
        target: z.object({
          id: ID.optional().describe("default: the entry's id"),
          imageSrc: z.string().min(1),
          print: printSchema.optional(),
          entity: z.union([z.object({ ref: ID }), entitySchema]).optional(),
        }),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ book, target, ...entry }) => {
      const entity = target.entity;
      if (entity && !("ref" in entity && Object.keys(entity).length === 1)) {
        const refused = refuseInvalid(entity, "target.entity");
        if (refused) return refused;
      }
      const result = await api.call<{ entry: Json; spreadId: string | null }>("POST", `/editor/books/${encodeURIComponent(book)}/entries`, { ...entry, target });
      return text({ ...result, ...(entity ? warnings(entity) : {}), open: editorHref(links, book, result.spreadId) });
    }),
  );

  server.registerTool(
    "delete_entry",
    { description: "Removes an entry and its target (changes recorded). The entry's files stay in the library.", inputSchema: z.object({ book: BOOK, entry: ID }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    guard(async ({ book, entry }) => {
      await api.call<void>("DELETE", `/editor/books/${encodeURIComponent(book)}/entries/${encodeURIComponent(entry)}`);
      return text({ deleted: entry, open: editorHref(links, book) });
    }),
  );

  // ── assets ──

  server.registerTool(
    "list_assets",
    { description: "The book's uploaded files: id, name, kind (model | video | image | audio), mime, size, width / height, version, url (what nodes and targets name), usages.", inputSchema: z.object({ book: BOOK, kind: z.enum(["model", "video", "image", "audio"]).optional() }), annotations: read },
    guard(async ({ book, kind }) => text(await api.call<Json>("GET", `/editor/books/${encodeURIComponent(book)}/assets${kind ? `?kind=${kind}` : ""}`))),
  );

  server.registerTool(
    "upload_asset",
    {
      description:
        "Uploads a file from this computer into the book's library: models (glb, gltf), videos (mp4, webm, mov), images (jpg, png, webp), sounds (mp3, m4a, ogg, wav), at most 64 MB. Answers the asset with its `url` – put it into a node's assets[].src or a target's imageSrc. The same bytes twice are one asset.",
      inputSchema: z.object({ book: BOOK, file: z.string().describe("a local file path"), name: z.string().optional().describe("the file name to store (default: the path's base name)") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ book, file, name }) => {
      const bytes = new Uint8Array(await readFile(file));
      const result = await api.upload<{ asset: Json }>("POST", `/editor/books/${encodeURIComponent(book)}/assets`, bytes, name ?? basename(file));
      return text({ ...result, size: bytes.byteLength });
    }),
  );

  server.registerTool(
    "delete_asset",
    { description: "Deletes an uploaded file (every version). Refused while a target, entity or entry names its url (409 asset-in-use with the usages) unless `force`.", inputSchema: z.object({ book: BOOK, asset: z.string().uuid().describe("the asset's id (list_assets)"), force: z.boolean().optional() }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    guard(async ({ book, asset, force }) => {
      await api.call<void>("DELETE", `/editor/books/${encodeURIComponent(book)}/assets/${encodeURIComponent(asset)}${force ? "?force=1" : ""}`);
      return text({ deleted: asset });
    }),
  );

  // ── publishing and the logs ──

  server.registerTool(
    "publish",
    {
      description:
        "Writes the draft as a content version into the content store of `env`: `local` (this API's own store – the reader started with VITE_CONTENT_BASE_URL=<api>/content/local shows it) or `staging`. **production is refused** – publishing to readers is the person's Publish button in the editor. 409 unknown-components when a node uses a component no compiled plugin provides.",
      inputSchema: z.object({ book: BOOK, env: z.enum(["local", "staging", "production"]), note: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ book, env, note }) => {
      if (env === "production") {
        return fail({
          error: { code: "production-is-a-person", message: "Publishing to production stays with a person: open the editor and press Publish there. This tool publishes to local or staging only." },
          open: editorHref(links, book),
        });
      }
      const result = await api.call<Json>("POST", `/editor/books/${encodeURIComponent(book)}/publish`, { env, ...(note ? { note } : {}) });
      return text({ ...result, open: editorHref(links, book) });
    }),
  );

  server.registerTool(
    "list_versions",
    { description: "The publish log, newest first: env, build, hash, who, when, note.", inputSchema: z.object({ book: BOOK }), annotations: read },
    guard(async ({ book }) => text(await api.call<Json>("GET", `/editor/books/${encodeURIComponent(book)}/versions`))),
  );

  server.registerTool(
    "list_changes",
    { description: "The change log, newest first: kind (entity | target | entry | plugin), ref, before, after, user, when. `limit` default 50, at most 500.", inputSchema: z.object({ book: BOOK, limit: z.number().int().min(1).max(500).optional() }), annotations: read },
    guard(async ({ book, limit }) => text(await api.call<Json>("GET", `/editor/books/${encodeURIComponent(book)}/changes${limit ? `?limit=${limit}` : ""}`))),
  );
}
