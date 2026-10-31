/**
 * The editor API's answers (`/api/editor/*` – server/api/src/Books.php, BookTexts.php, ContentVersion.php, Assets.php,
 * Plugins.php, Removal.php; docs/server.md "Editor data"), once for the editor app and the MCP server. Each type is what the PHP
 * sends: a field is optional only where the PHP leaves it out, `| null` where it sends null.
 * Not content: `shared/api/` is outside the content schema lock (RULES #10).
 */
import type { ContentManifest } from "../types/content-manifest";
import type { EnvironmentData } from "../types/environment";
import type { BookData, EntityData, EntryData, PassData, SpreadData, StepData, TargetData } from "../types/game-config";
import type { AssetKind, SourceTypes } from "./rules";

// ── Books ──────────────────────────────────────────────────────────────────────────────────────────

/** Where a book is live: an environment serving its build `build` since `since` */
export interface LiveIn {
  env: string;
  build: string | null;
  since: string | null;
}

/** What an environment serves (`book` null when it cannot be told), or `error` when its content store cannot be read */
export type EnvironmentServing = { env: string; book: string | null; build: string | null; since: string | null } | { env: string; error: string };

/** A book of the list and of the tree (`Books::summary`) */
export interface BookSummary {
  id: string;
  title: string;
  author: string;
  /** The configuration's `book` as imported and edited since: its environment, its passes */
  book: BookData;
  /** The spread the book opens on – it cannot be removed */
  initialSpreadId: string;
  /** The content schema `MAJOR.MINOR` of the import */
  schema: string;
  /** Where the content's `/assets/content/…` paths resolve (the layout, the cover); "" = the draft's origin */
  assetsBase: string;
  /** `version.hash` of the imported configuration, null when it had none */
  importedHash: string | null;
  spreads: number;
  createdAt: string;
  updatedAt: string;
  lastPublish: { env: string; build: string; at: string } | null;
  /** The environments serving this book – empty: draft only */
  live: LiveIn[];
}

/** `GET /editor/books`: the books, and what each environment serves – only those that serve something */
export interface BookList {
  books: BookSummary[];
  environments: EnvironmentServing[];
}

/** An entry in the tree; `category` as the content holds it */
export interface TreeEntry {
  id: string;
  category: string;
  title: string;
  page: number;
  /** Its target (the entity inline or `{ ref }`), null when it has none */
  target: TargetData | null;
}

/** A spread in the tree: the spread as the content holds it, with the entries on its pages */
export type TreeSpread = SpreadData & { entries: TreeEntry[] };

/** `GET /editor/books/{id}`: the book, its spreads with their entries, and the entries whose page is in no spread */
export interface BookTree {
  book: BookSummary;
  spreads: TreeSpread[];
  unassigned: TreeEntry[];
}

/** `GET /editor/books/{id}/draft/latest.json`: the draft's manifest – its build now (what a publish would write) */
export type DraftManifest = Required<ContentManifest>;

// ── Environments and publishing ──────────────────────────────────────────────────────────────────────

/** An environment as `GET /editor/environments` describes it: its backend, whether this instance publishes there */
export interface EnvironmentInfo {
  env: string;
  /** `cdn` – the CDN's storage zone; `server` – the directory store this API serves */
  store: "cdn" | "server";
  /** Only the instance's own environment */
  publish: boolean;
  /** Where readers load it */
  url: string | null;
  /** Wherever the directory store is the publish target: what that means */
  warning: string | null;
}

/** `GET /editor/environments`: this instance's environment (the only one it publishes to) and every environment's backend */
export interface EnvironmentsInfo {
  env: string;
  environments: EnvironmentInfo[];
}

/** `POST /editor/books/{id}/publish` */
export interface PublishResult {
  env: string;
  /** Where it went: the CDN or this server's directory store */
  store: "cdn" | "server";
  build: string;
  hash: string;
  publishedAt: string;
  /** The book this publish replaced in the environment, null when there was none */
  replaced: { book: string | null; build: string | null } | null;
}

/** `details.current` of a 409 other-book: what the environment serves instead */
export interface OtherBook {
  env: string;
  book: string | null;
  title: string | null;
  build: string | null;
  since: string | null;
}

/** A row of the publish log (`GET /editor/books/{id}/versions`, newest first) */
export interface PublishedVersion {
  id: string;
  env: string;
  build: string;
  hash: string;
  /** The e-mail address of who published, null when the account is gone */
  publishedBy: string | null;
  publishedAt: string;
  note: string | null;
}

/** A row of the change log (`GET /editor/books/{id}/changes`, newest first); `token` = the AI connection's name, else null */
export interface Change {
  id: string;
  kind: string;
  ref: string;
  before: unknown;
  after: unknown;
  user: string | null;
  token: string | null;
  createdAt: string;
}

// ── Import ───────────────────────────────────────────────────────────────────────────────────────────

/** Where an import's configuration came from: the instance's CDN, or a configuration in the body */
export type ImportSourceKind = "cdn" | "configuration";

/** What an import recorded – the build the draft is based on (`Books::basedOn`); a field null where nothing told */
export interface ImportedBuild {
  build: string | null;
  hash: string | null;
  date: string | null;
  appVersion: string | null;
  schema: string | null;
  source: ImportSourceKind | null;
  from: string | null;
  importedAt: string | null;
  importedBy: string | null;
}

/** What an import brings in (`Books::incoming`): the book, its build and where it comes from */
export interface IncomingBuild {
  book: string;
  title: string;
  build: string | null;
  hash: string | null;
  date: string | null;
  appVersion: string | null;
  schema: string;
  source: ImportSourceKind;
  from: string | null;
}

/** The rows a configuration holds */
export interface ImportCounts {
  spreads: number;
  entries: number;
  targets: number;
  entities: number;
}

/** `details.comparison` of a 409 confirm-import, and a preview's `existing`: what comes in against the draft */
export interface ImportComparison {
  book: { id: string; title: string };
  incoming: IncomingBuild;
  draft: {
    basedOn: ImportedBuild | null;
    build: string;
    edits: number;
    editsSince: string | null;
    recentEdits: { kind: string; ref: string; user: string | null; token: string | null; at: string }[];
    live: { env: string; build: string | null; current: boolean }[];
  };
  same: boolean;
}

/**
 * `POST /editor/import/preview`: what an import body would bring in, nothing imported – `existing` is the comparison the
 * import would answer (null: a new book); `contentBase` / `manifest` the CDN's content base and its latest.json
 */
export interface ImportPreview {
  source: ImportSourceKind;
  contentBase: string | null;
  manifest: { url: string; build: string; activatedAt: string | null } | null;
  incoming: IncomingBuild;
  counts: ImportCounts;
  existing: ImportComparison | null;
}

/** `POST /editor/books/{id}/import`: the book, what came in, the draft's build now and the build it is based on */
export interface ImportResult {
  book: BookSummary;
  counts: ImportCounts;
  draft: { build: string; hash: string };
  imported: ImportedBuild | null;
}

/** `details.confirmation` of a two-step write's first 409 (`Confirmation::issue`): the id to send back, until `expiresAt` */
export interface Confirmation {
  id: string;
  expiresAt: string;
}

// ── Rows: entities, targets, entries, spreads, the book's passes and environment ─────────────────────────

/** `GET /editor/books/{id}/entities`: the shared entities by ref */
export interface SharedEntities {
  entities: Record<string, EntityData>;
}

/** `PUT /editor/books/{id}/entities/{ref}` */
export interface EntitySaved {
  ref: string;
  entity: EntityData;
}

/** `PUT /editor/books/{id}/targets/{targetId}`: the whole target after the change */
export interface TargetSaved {
  target: TargetData;
}

/**
 * `POST /editor/books/{id}/entries` → 201: the new entry with its target (none when it was made without one), and the
 * spread its page belongs to (null: none)
 */
export interface EntryAdded {
  entry: { id: string; category: string; title: string; page: number; body: string; tags: string[]; target?: TargetData };
  spreadId: string | null;
}

/** An entry as the content holds it, without its target (`BookTexts`): every field as written – an image's path or URL unresolved */
export type EntryFields = Omit<EntryData, "target">;

/** One entry of `GET /editor/books/{id}/entries`: its fields, its spread (null: its page is in none) and its target's id and image */
export type EditorEntry = EntryFields & { spreadId: string | null; target: { id: string; imageSrc: string } | null };

/** `GET /editor/books/{id}/entries`: every entry in the book's order */
export interface EntryList {
  entries: EditorEntry[];
}

/** `PUT /editor/books/{id}/entries/{entryId}`: the entry after the change, its spread now and before */
export interface EntrySaved {
  entry: EntryFields;
  spreadId: string | null;
  previousSpreadId: string | null;
}

/** `PUT /editor/books/{id}`: the book's `book` after the change (title, author, publisher and the rest it holds) */
export interface BookSaved {
  book: BookData;
}

/** `GET` and `PUT /editor/books/{id}/tutorial`: the onboarding's steps in their order (`index` = the place in the list) */
export interface TutorialSaved {
  tutorial: StepData[];
}

/** `PUT /editor/books/{id}/spreads/{spreadId}`: the spread after the change */
export interface SpreadSaved {
  spread: SpreadData;
}

/** The rows a new or removed double page renumbered (the later spreads, the entries on their pages, the printed pages) */
export interface MovedRows {
  spreads: number;
  entries: number;
  targets: number;
}

/** `POST /editor/books/{id}/spreads` → 201 */
export interface SpreadAdded {
  spread: SpreadData;
  moved: MovedRows;
}

/** `PUT /editor/books/{id}/passes`: the book's post-processing, null when removed */
export interface BookPassesSaved {
  passes: PassData[] | null;
}

/** `PUT /editor/books/{id}/environment`: the book's environment, null when removed (the default applies) */
export interface EnvironmentSaved {
  environment: EnvironmentData | null;
}

// ── Removing a spread or an entry ─────────────────────────────────────────────────────────────────

/** A Library file a removal touches: used only by the removed rows, or (`usedBy`) elsewhere too */
export interface RemovalFile {
  id: string;
  name: string;
  kind: AssetKind;
  size: number;
  url: string;
  usedBy?: Usage[];
}

/** What every removal takes (`Removal::impact`) */
interface RemovalTakes {
  book: string;
  /** By how many pages the later pages move back (0: a cover, an entry, or nothing after it) */
  pagesBack: number;
  entries: { id: string; title: string; page: number; category: string }[];
  targets: { id: string; entry: string; imageSrc: string }[];
  /** The entities that go: a shared one with its `ref`, a target's own with `ref: null` */
  entities: { ref: string | null; type: string | null; shared: boolean; targets: string[] }[];
  /** Shared entities that stay, because `usedBy` targets elsewhere use them */
  keptEntities: { ref: string; type: string; targets: string[]; usedBy: string[] }[];
  files: { onlyHere: RemovalFile[]; elsewhere: RemovalFile[] };
  counts: { entries: number; targets: number; entities: number; keptEntities: number; filesOnlyHere: number; filesElsewhere: number };
}

/** `details.impact` of a 409 confirm-delete (docs/server.md "Removing a spread or an entry") */
export type RemovalImpact = RemovalTakes &
  (
    | { kind: "spread"; spread: { id: string; title: string; firstPage: number; lastPage: number; format: string } }
    | { kind: "entry"; entry: { id: string; title: string; page: number; category: string; spread: string | null } }
  );

/** What a confirmed removal took (`files` only with `deleteFiles`) and the rows that moved */
export interface RemovalResult {
  deleted: { spread: string | null; entries: string[]; targets: string[]; entities: string[]; files: string[] };
  moved: MovedRows;
}

// ── Assets ───────────────────────────────────────────────────────────────────────────────────────────

/** A Library file (`GET /editor/books/{id}/assets`): an upload, or a file of the content import (`imported`) */
export interface Asset {
  id: string;
  name: string;
  /** `shader`: a source file a plugin loads by its URL (`api.loadText`) */
  kind: AssetKind;
  mime: string;
  size: number;
  /** The picture's size in pixels (images, videos), null when the file does not tell */
  width: number | null;
  height: number | null;
  /** A video's duration in ms, null for other kinds or when the file does not tell */
  durationMs: number | null;
  version: number;
  /** The absolute URL nodes and targets name */
  url: string;
  usages: number;
  /** A file of the content import (`files.json`), not an upload: read-only, no replace or delete */
  imported: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Where a file or a plugin is used: a row of the draft (`entity castle`), the book, or a plugin source that loads the file */
export interface Usage {
  kind: string;
  ref: string;
}

/** `GET /editor/books/{id}/assets[?kind=]` */
export interface AssetList {
  assets: Asset[];
}

/** `POST /editor/books/{id}/assets` → 201 (or 200: the same bytes are an asset already) */
export interface AssetUploaded {
  asset: Asset;
}

/** `PUT /editor/books/{id}/assets/{assetId}/file`: the new version, and how many rows now name it */
export interface AssetReplaced {
  asset: Asset;
  relinked: number;
}

/** `GET /editor/books/{id}/assets/{assetId}/usages` */
export interface AssetUsages {
  usages: Usage[];
  asset: Asset;
}

// ── Plugin sources (the Code tab) ────────────────────────────────────────────────────────────────────

/** A plugin source in the list (`GET /editor/books/{id}/plugins`) */
export interface PluginSummary {
  id: string;
  size: number;
  /** The draft's rows that use a type it registers */
  usages: number;
  updatedAt: string;
  updatedBy: string | null;
}

/** One plugin source (`GET`, `PUT`, `POST …/plugins`, `PUT …/file` – `{ plugin }`): its text, without the list's `usages` */
export interface PluginSource {
  id: string;
  source: string;
  size: number;
  updatedAt: string;
  updatedBy: string | null;
}

/** `GET /editor/books/{id}/plugins/{pluginId}/usages`: where the draft uses what it registers, and what that is */
export interface PluginUsages {
  usages: Usage[];
  registers: SourceTypes;
}
