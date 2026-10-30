// The editor's content tools over the API (`/api/editor/*`, docs/server.md "Editor data", "Assets"): the book's tree
// and spreads, entities and targets, entries, the spreads themselves, the book's passes and environment, assets, the
// draft, publishing to local / staging, the logs. Every write is checked against the shared content contract first and
// answers with the editor's link, where the person checks the draft on the stage. Production stays with the person –
// the tool refuses it.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import { checkEntity, describeContentModel, pluginTypes, usesPluginTypes, type BookModel } from "./model.ts";
import { fail, guard, text, type Result } from "./result.ts";
import { editorHref, type AppLinks } from "./services.ts";
import type { EntityData, EntityRefData, PassData, PluginData, PrintPlacement } from "../../shared/types/game-config";
import { PASS_TYPES, passProblems, PRINT_SURFACES, SPREAD_FORMATS } from "../../shared/types/game-config";
import { ENVIRONMENT_WORLDS, environmentProblems } from "../../shared/types/environment";

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

const passSchema = z.object({ type: z.string().min(1) }).catchall(z.union([z.number(), z.string(), z.boolean()])).describe("a pass: { type, …parameters } (describe_content_model passes)");
const passesSchema = z.array(passSchema);

/** The contract's verdict over a passes list (built-in types, every parameter in range) as a tool error, or null */
function refusePasses(passes: unknown, path: string): Result | null {
  const problems = passProblems(passes, path);
  if (!problems.length) return null;
  return fail({
    error: { code: "invalid-passes", message: `${path} does not match the content contract (nothing was sent).`, problems },
    hint: `describe_content_model lists the passes (${PASS_TYPES.join(", ")}) with their parameters.`,
  });
}

/**
 * Checks an entity against the content contract before it is sent: the guard's verdict as a tool error (`refused`),
 * else the warnings for the answer. The book's plugins are read only when the tree names a type that is not built in.
 */
async function checkWrite(entity: unknown, path: string, book: () => Promise<BookModel>): Promise<{ refused: Result | null; warnings: { warnings?: string[] } }> {
  const check = checkEntity(entity, path, usesPluginTypes(entity) ? await book() : undefined);
  if (check.problems.length) {
    return {
      refused: fail({
        error: { code: "invalid-entity", message: `${path} does not match the content contract (nothing was sent).`, problems: check.problems },
        hint: "describe_content_model { book } lists the node types, placement, filters and components – the book's plugins' too.",
      }),
      warnings: {},
    };
  }
  const warnings = [
    ...(check.unknownComponents.length ? [`component types no built-in or known plugin provides: ${check.unknownComponents.join(", ")} – a plugin must register them, else the publish is refused`] : []),
    ...(check.unverifiedNodeTypes.length ? [`node types no known plugin registers: ${check.unverifiedNodeTypes.join(", ")} – a plugin of the book whose types are not recorded must register them, else the publish is refused`] : []),
  ];
  return { refused: null, warnings: warnings.length ? { warnings } : {} };
}

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
  /** the book's plugins: the declared ones with what they recorded (the draft), the Code tab's sources with the types read from them */
  const bookModel = async (book: string): Promise<BookModel> => {
    const [{ configuration }, { plugins }] = await Promise.all([draft(book), api.call<{ plugins: { id: string }[] }>("GET", `/editor/books/${encodeURIComponent(book)}/plugins`)]);
    const sources = await Promise.all(
      plugins.map(async p => {
        const { plugin } = await api.call<{ plugin: { id: string; source: string } }>("GET", `/editor/books/${encodeURIComponent(book)}/plugins/${encodeURIComponent(p.id)}`);
        return { id: plugin.id, ...pluginTypes(plugin.source) };
      }),
    );
    return { declared: configuration.plugins ?? [], sources };
  };

  // ── reading ──

  server.registerTool(
    "list_books",
    { description: "The instance's books: id, title, author, number of spreads, content schema, last publish, `live` (the environments serving it – empty: draft only) – and the editor's link of each; `environments` = what each environment serves.", inputSchema: z.object({}), annotations: read },
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
        "What you may write: node types (and node names), placement (units, defaults), filters, components with their parameters, post-processing passes, the environment, printed placement, entry categories, spread formats – from the shared content contract. With `book`: also the compiled plugins its configuration declares with the components, layers, node types and passes they recorded (their parameters), and the Code tab's sources with the types read from them.",
      inputSchema: z.object({ book: BOOK.optional() }),
      annotations: read,
    },
    guard(async ({ book }) => text(describeContentModel(book ? await bookModel(book) : undefined))),
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
      const { refused, warnings } = await checkWrite(entity, "entity", () => bookModel(book));
      if (refused) return refused;
      const result = await api.call<{ ref: string; entity: EntityData }>("PUT", `/editor/books/${encodeURIComponent(book)}/entities/${encodeURIComponent(ref)}`, entity);
      return text({ ...result, ...warnings, open: editorHref(links, book) });
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
      const { refused, warnings } = entity ? await checkWrite(entity, "entity", () => bookModel(book)) : { refused: null, warnings: {} };
      if (refused) return refused;
      const [result, t] = await Promise.all([api.call<{ target: TreeTarget }>("PUT", `/editor/books/${encodeURIComponent(book)}/targets/${encodeURIComponent(target)}`, body), tree(book)]);
      return text({ ...result, ...warnings, open: editorHref(links, book, spreadOf(t, target)) });
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
      const inline = entity && !("ref" in entity && Object.keys(entity).length === 1);
      const { refused, warnings } = inline ? await checkWrite(entity, "target.entity", () => bookModel(book)) : { refused: null, warnings: {} };
      if (refused) return refused;
      const result = await api.call<{ entry: Json; spreadId: string | null }>("POST", `/editor/books/${encodeURIComponent(book)}/entries`, { ...entry, target });
      return text({ ...result, ...warnings, open: editorHref(links, book, result.spreadId) });
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

  // ── writing: the spreads, the book's passes and environment ──

  server.registerTool(
    "add_spread",
    {
      description:
        "Adds a spread to the book (a change recorded for each row it moves): `format: \"spread\"` = a double page after the spread `after` (default: the last one before the back cover) – its pages are the two after that spread's last page, and every later page is numbered on by two (the later spreads, the entries on those pages and their targets' print.page move with them; `moved` counts them); `id` (default spread-<n>) and `title` optional. `format: \"cover\"` = the front cover (page 0, first), `\"back\"` = the back cover (the page after the last) – nothing moves; 409 duplicate-id when the book has one.",
      inputSchema: z.object({
        book: BOOK,
        format: z.enum(SPREAD_FORMATS).describe("spread = a double page, cover = the front cover, back = the back cover"),
        after: ID.optional().describe("a double page only: the spread it follows (get_book)"),
        id: ID.optional().describe("a double page only: its id (default: the first free spread-<n>)"),
        title: z.string().min(1).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async ({ book, format, after, id, title }) => {
      if (format !== "spread" && (after !== undefined || id !== undefined)) {
        return fail({ error: { code: "mcp", message: "after and id are for a double page – the covers have their places and ids (cover, back)" } });
      }
      const body: Json = { format, ...(after ? { after } : {}), ...(id ? { id } : {}), ...(title ? { title } : {}) };
      const result = await api.call<{ spread: TreeSpread; moved: Json }>("POST", `/editor/books/${encodeURIComponent(book)}/spreads`, body);
      return text({ ...result, open: editorHref(links, book, result.spread.id) });
    }),
  );

  server.registerTool(
    "put_spread",
    {
      description:
        "Changes a spread: `title`, `format` (spread | cover | back – a cover is page 0, so a spread with other pages cannot become one: add_spread makes covers), `passes` = the spread's own post-processing that replaces the book's for this spread ([{ type, …parameters }], built-in types – describe_content_model passes; [] turns post-processing off here, null gives the spread the book's passes again). Send what changes; checked against the contract; a change is recorded.",
      inputSchema: z.object({
        book: BOOK,
        spread: ID.describe("the spread's id (get_book)"),
        title: z.string().min(1).optional(),
        format: z.enum(SPREAD_FORMATS).optional(),
        passes: passesSchema.nullable().optional(),
      }),
      annotations: write,
    },
    guard(async ({ book, spread, title, format, passes }) => {
      const body: Json = {};
      if (title !== undefined) body.title = title;
      if (format !== undefined) body.format = format;
      if (passes !== undefined) {
        const refused = passes === null ? null : refusePasses(passes, "passes");
        if (refused) return refused;
        body.passes = passes;
      }
      if (Object.keys(body).length === 0) return fail({ error: { code: "mcp", message: "send title, format or passes" } });
      const result = await api.call<{ spread: Json }>("PUT", `/editor/books/${encodeURIComponent(book)}/spreads/${encodeURIComponent(spread)}`, body);
      return text({ ...result, open: editorHref(links, book, spread) });
    }),
  );

  server.registerTool(
    "delete_spread",
    {
      description:
        "Removes a spread without entries (a change recorded): a double page takes its pages with it – every later page is numbered back (the later spreads, the entries on those pages, their targets' print.page); a cover moves nothing. 409 spread-not-empty (with `entries`) while entries are on it – delete them first with delete_entry, never the spread with them; 409 initial-spread for the spread the book opens on.",
      inputSchema: z.object({ book: BOOK, spread: ID.describe("the spread's id (get_book)") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    guard(async ({ book, spread }) => {
      await api.call<void>("DELETE", `/editor/books/${encodeURIComponent(book)}/spreads/${encodeURIComponent(spread)}`);
      return text({ deleted: spread, open: editorHref(links, book) });
    }),
  );

  server.registerTool(
    "put_book_passes",
    {
      description:
        "Sets the book's post-processing – the master chain every spread without its own passes shows: [{ type, …parameters }] run in order over the rendered image (built-in types bloom, vignette, grade – describe_content_model passes); [] = none; null removes it. A spread's own passes (put_spread) still replace it there. Checked against the contract; a change is recorded.",
      inputSchema: z.object({ book: BOOK, passes: passesSchema.nullable() }),
      annotations: write,
    },
    guard(async ({ book, passes }) => {
      const refused = passes === null ? null : refusePasses(passes, "passes");
      if (refused) return refused;
      const result = await api.call<{ passes: PassData[] | null }>("PUT", `/editor/books/${encodeURIComponent(book)}/passes`, { passes });
      return text({ ...result, open: editorHref(links, book) });
    }),
  );

  server.registerTool(
    "put_environment",
    {
      description:
        "Sets the book's environment – the world around the reader while scanning and the onion sky: { world, onionSky, worldSrc?, skySrc? } – worldSrc a glTF model (an uploaded asset's url: .glb / .gltf) in place of the built-in world's scenery, skySrc an equirectangular image (.jpg / .png / .webp) for the sky; null removes it (the default world, the onion sky on). Book-level; the reader's Graphics switches still apply on top. Checked against the contract; a change is recorded.",
      inputSchema: z.object({
        book: BOOK,
        environment: z
          .object({
            world: z.enum(ENVIRONMENT_WORLDS),
            onionSky: z.boolean().describe("looking up, the camera picture's sky shows the world's sky"),
            worldSrc: z.string().min(1).optional().describe("a glTF model: the scenery around the reader"),
            skySrc: z.string().min(1).optional().describe("an equirectangular image (2:1): the sky"),
          })
          .strict()
          .nullable(),
      }),
      annotations: write,
    },
    guard(async ({ book, environment }) => {
      const problems = environment === null ? [] : environmentProblems(environment);
      if (problems.length) {
        return fail({ error: { code: "invalid-environment", message: "environment does not match the content contract (nothing was sent).", problems }, hint: "describe_content_model lists the worlds and the files worldSrc and skySrc may be." });
      }
      const result = await api.call<{ environment: Json | null }>("PUT", `/editor/books/${encodeURIComponent(book)}/environment`, { environment });
      return text({ ...result, open: editorHref(links, book) });
    }),
  );

  // ── assets ──

  server.registerTool(
    "list_assets",
    { description: "The book's uploaded files: id, name, kind (model | video | image | audio), mime, size, width / height (pixels, images and videos), durationMs (videos), version, url (what nodes and targets name), usages. width / height / durationMs are read from the file on upload – null when unknown (an imported file, an older upload). A video plane is one target width wide and as high as the file's proportions; scale a portrait video's node by width / height to keep it within the target's width, and time an animation by durationMs.", inputSchema: z.object({ book: BOOK, kind: z.enum(["model", "video", "image", "audio"]).optional() }), annotations: read },
    guard(async ({ book, kind }) => text(await api.call<Json>("GET", `/editor/books/${encodeURIComponent(book)}/assets${kind ? `?kind=${kind}` : ""}`))),
  );

  server.registerTool(
    "upload_asset",
    {
      description:
        "Uploads a file from this computer into the book's library: models (glb, gltf), videos (mp4, webm, mov), images (jpg, png, webp), sounds (mp3, m4a, ogg, wav), at most 64 MB. Answers the asset with its `url` – put it into a node's assets[].src or a target's imageSrc – and the file's width / height (images, videos) and durationMs (videos), null when the file does not tell. The same bytes twice are one asset.",
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
        "Writes the draft as a content version into the content store of `env`: `local` (this API's own store – the reader started with VITE_CONTENT_BASE_URL=<api>/content/local shows it) or `staging`. **production is refused** – publishing to readers is the person's Publish button in the editor. 409 unknown-components when a node uses a component no compiled plugin provides. Each environment serves one book: 409 other-book (with `current`, the book it serves) when it serves another – replacing it is the person's decision in the editor, never this tool's.",
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
