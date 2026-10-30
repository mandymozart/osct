import type { EntityData, EntityRefData, GameConfiguration, PassData } from "@engine/types";
import type { EnvironmentData } from "@shared/types/environment";
import type { AssetType, PrintPlacement, SpreadFormat } from "@shared/types/game-config";

export type { PrintPlacement };

/**
 * The instance's API (server/api, docs/server.md): the accounts endpoints the sign-in uses and the editor's own
 * `/editor/*`. `VITE_API_URL` names it (default `/api`, next to the app – the dev server proxies it to the PHP dev
 * API). The session token lives in `localStorage`; `authFetch` is the `fetch` the engine's content loader uses for
 * the draft, so the draft endpoints see the token too.
 */

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/+$/, "");

const TOKEN_KEY = "osct-editor-session";

export class ApiError extends Error {
  /** `details` = the rest of the server's error object (e.g. `current` of a 409 other-book) */
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the session holds while the page lives
  }
};

/** `fetch` with the session token – also handed to the engine for the draft content */
export const authFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

/** Called when the session ended under the page (a 401 to the stored token) – the session store registers it */
let sessionEnded: (() => void) | null = null;

/** Who hears that the session ended (`session.svelte.ts`); null: nobody */
export const onSessionEnd = (handler: (() => void) | null): void => {
  sessionEnded = handler;
};

/**
 * A 401 to a call that carried the stored token means the session is gone (expired, signed out elsewhere, the
 * account's roles revoked): the token is cleared and the session store hears it. Not when the token changed
 * meanwhile (a new sign-in), nor when no token was sent – then a 401 is only "not signed in".
 */
const checkSession = (response: Response, sentToken: string | null): void => {
  if (response.status !== 401 || sentToken === null || getToken() !== sentToken) return;
  setToken(null);
  sessionEnded?.();
};

/**
 * A JSON call to the API; errors come back as `ApiError` with the server's code. A 401 ends the session
 * (`checkSession`) unless `unauthorizedIsAnswer`: the sign-in calls (a wrong code or password), the sign-out and
 * the startup check of a stored token, where a 401 is the expected answer and the caller handles it.
 */
export const api = async <T>(method: string, path: string, body?: unknown, options: { unauthorizedIsAnswer?: boolean } = {}): Promise<T> => {
  const sentToken = getToken();
  const response = await authFetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!options.unauthorizedIsAnswer) checkSession(response, sentToken);
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string } & Record<string, unknown> } | null;
  if (!response.ok) {
    const { code, message, ...details } = data?.error ?? { code: "unknown", message: "" };
    throw new ApiError(response.status, code ?? "unknown", message || `${response.status} ${response.statusText}`, details);
  }
  return data as T;
};

// ── Shapes ───────────────────────────────────────────────────────────────────────────────────────

/** The account (docs/server.md): `roles` has `reader` for everyone, `editor` (the editor), `admin` (the admin page) */
export interface User {
  email: string;
  language: string;
  options: Record<string, boolean>;
  hasPassword: boolean;
  roles: string[];
  createdAt: string;
}

/** Where a book is live: an environment serving its version `build` since `since` */
export interface LiveIn {
  env: string;
  build: string | null;
  since: string | null;
}

/** What an environment serves: `book` null when it cannot be told; `error` when its store cannot be read */
export interface EnvironmentServing {
  env: string;
  book?: string | null;
  build?: string | null;
  since?: string | null;
  error?: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  spreads: number;
  updatedAt: string;
  lastPublish?: { env: string; build: string; at: string } | null;
  /** The environments serving this book – empty: draft only */
  live?: LiveIn[];
  /** Where the content's `/assets/content/…` paths resolve (the layout, the cover); empty: the draft's origin */
  assetsBase?: string | null;
  /** The spread the book opens on – it cannot be removed */
  initialSpreadId?: string;
}

export interface TreeTarget {
  id: string;
  imageSrc: string;
  entity?: EntityData | EntityRefData;
  /** Where it is printed (a target made in the editor, or content that carries it); else the book's layout knows */
  print?: PrintPlacement | null;
}

export interface TreeEntry {
  id: string;
  title: string;
  category: string;
  page: number;
  target?: TreeTarget;
}

export interface TreeSpread {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  /** `spread` (default), `cover`, `back` (content schema 2.3) */
  format?: SpreadFormat;
  entries: TreeEntry[];
}

export interface BookTree {
  book: BookSummary & { schema?: string; book?: { environment?: EnvironmentData } };
  spreads: TreeSpread[];
}

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

export interface EnvironmentsInfo {
  env: string;
  environments: EnvironmentInfo[];
}

/** A build an import brought in, or the one the draft is based on */
export interface ImportedBuild {
  build: string | null;
  hash: string | null;
  date: string | null;
  appVersion: string | null;
  schema: string | null;
  source: "cdn" | "configuration" | null;
  from: string | null;
  importedAt?: string | null;
  importedBy?: string | null;
}

/** `details.comparison` of a 409 confirm-import: what comes in against the draft */
export interface ImportComparison {
  book: { id: string; title: string };
  incoming: ImportedBuild & { book: string; title: string };
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
 * `POST /editor/import/preview`: what an import body would bring in, nothing imported – the book and its build, what it
 * holds, and the draft of that id it would replace (`existing`, the comparison the import answers; null: a new book).
 * `contentBase` / `manifest`: the content base and its latest.json – the server's for the CDN, the form's for a URL.
 */
export interface ImportPreview {
  source: "cdn" | "configuration";
  contentBase: string | null;
  manifest: { url: string; build: string; activatedAt: string | null } | null;
  incoming: ImportComparison["incoming"];
  counts: { spreads: number; entries: number; targets: number; entities: number };
  existing: ImportComparison | null;
}

/** `details.confirmation` of a 409 confirm-import */
export interface ImportConfirmation {
  id: string;
  expiresAt: string;
}

export interface PublishResult {
  env: string;
  /** Where it went: the CDN or this server */
  store?: "cdn" | "server";
  build: string;
  hash: string;
  publishedAt: string;
  /** The book this publish replaced in the environment */
  replaced?: { book: string | null; build: string | null } | null;
}

/** `details.current` of a 409 other-book: what the environment serves instead */
export interface OtherBook {
  env: string;
  book: string | null;
  title: string | null;
  build: string | null;
  since: string | null;
}

// ── Accounts ────────────────────────────────────────────────────────────────────────────────────

// A 401 here is an answer the caller handles (a wrong password, a token checked at startup), not a lost session
const signIn = { unauthorizedIsAnswer: true };

export const requestCode = (email: string) =>
  api<{ requestId: string; expiresAt: string }>("POST", "/auth/request", { email, language: "en" }, signIn);

export const verifyCode = (requestId: string, code: string) =>
  api<{ session: string; user: User }>("POST", "/auth/verify", { requestId, code }, signIn);

export const signInWithPassword = (email: string, password: string) =>
  api<{ session: string; user: User }>("POST", "/auth/password", { email, password }, signIn);

export const me = () => api<{ user: User }>("GET", "/user", undefined, signIn);

export const logout = () => api<void>("POST", "/auth/logout", undefined, signIn);

// ── AI connections (docs/server.md "AI connections"): personal access tokens for the MCP server ──

/** A token as the list shows it – never the token itself, which only `createApiToken` answers, once */
export interface ApiToken {
  id: string;
  name: string;
  /** its first characters and an ellipsis (`osct_AbCd…`), to tell tokens apart */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

export const listApiTokens = () => api<{ tokens: ApiToken[] }>("GET", "/user/tokens");

export const createApiToken = (name: string) => api<{ token: string; apiToken: ApiToken }>("POST", "/user/tokens", { name });

export const renewApiToken = (id: string) => api<{ apiToken: ApiToken }>("POST", `/user/tokens/${encodeURIComponent(id)}/renew`);

export const revokeApiToken = (id: string) => api<void>("DELETE", `/user/tokens/${encodeURIComponent(id)}`);

/** The instance's health: its version and its environment (`local`, `staging`, `production`; absent from an older API) */
export interface Health {
  status: string;
  version: string;
  env?: string;
  db: string;
}

export const getHealth = () => api<Health>("GET", "/health");

// ── Admin (docs/server.md "Admin API", docs/admin.md) ───────────────────────────────────────────

export interface Role {
  id: number;
  name: string;
  description: string;
}

/** One role of a user: when and by whom it was granted (`grantedBy`: signup, migration, config, secret or an admin's id) */
export interface RoleGrant {
  role: string;
  grantedAt: string;
  grantedBy: string | null;
  grantedByEmail: string | null;
}

export interface AdminUser extends User {
  id: string;
  grants: RoleGrant[];
  lastSeenAt: string | null;
}

export interface UsersQuery {
  /** A part of the e-mail address */
  q?: string;
  /** Only users with this role */
  role?: string;
  /** Only users with an update option on */
  newsletter?: boolean;
}

const usersParams = (query: UsersQuery): string => {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.role) params.set("role", query.role);
  if (query.newsletter) params.set("newsletter", "1");
  const s = params.toString();
  return s ? `?${s}` : "";
};

export const listRoles = () => api<{ roles: Role[] }>("GET", "/admin/roles");

export const listUsers = (query: UsersQuery = {}) => api<{ users: AdminUser[]; total: number }>("GET", `/admin/users${usersParams(query)}`);

export const grantRole = (userId: string, role: string) =>
  api<{ changed: boolean; user: AdminUser }>("PUT", `/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`);

export const revokeRole = (userId: string, role: string) =>
  api<{ changed: boolean; user: AdminUser }>("DELETE", `/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`);

/** Makes (or creates) an editor by e-mail address */
export const inviteEditor = (email: string) => api<{ user: AdminUser; created: boolean; changed: boolean }>("POST", "/admin/editors", { email });

/** The users as CSV (`newsletter` keeps those with an update option on), as a file the browser saves */
export const downloadUsersCsv = async (newsletter: boolean): Promise<void> => {
  const sentToken = getToken();
  const response = await authFetch(`${API_URL}/admin/users.csv${newsletter ? "?newsletter=1" : ""}`);
  checkSession(response, sentToken);
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(response.status, data?.error?.code ?? "unknown", data?.error?.message ?? `${response.status} ${response.statusText}`);
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "users.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

// ── Editor ──────────────────────────────────────────────────────────────────────────────────────

export const listBooks = () => api<{ books: BookSummary[]; environments?: EnvironmentServing[] }>("GET", "/editor/books");

export const getBook = (bookId: string) => api<BookTree>("GET", `/editor/books/${encodeURIComponent(bookId)}`);

/** What an import sends: a configuration, or the instance CDN's current version – `confirm` = the second step */
export type ImportSource = { configuration: GameConfiguration; files?: unknown; assetsBase?: string } | { source: "cdn" };
export type ImportBody = ImportSource & { confirm?: string };

/** What the import of this body would bring in and replace – read-only; 502 content-fetch-failed names the `url` */
export const previewImport = (body: ImportSource) => api<ImportPreview>("POST", "/editor/import/preview", body);

/**
 * Imports into the book. Over a book that exists the API answers 409 `confirm-import` (or `confirmation-void`) with
 * `details.comparison` (an `ImportComparison`) and `details.confirmation` – the same call with `confirm` then imports.
 */
export const importBook = (bookId: string, body: ImportBody) =>
  api<{ book: BookSummary; imported?: ImportedBuild | null }>("POST", `/editor/books/${encodeURIComponent(bookId)}/import`, body);

/** This instance's environments (`GET /editor/environments`): the one it publishes to, each one's backend */
export const listEnvironments = () => api<EnvironmentsInfo>("GET", "/editor/environments");

/** The draft's manifest: its build now (what a publish would write) */
export const getDraftManifest = (bookId: string) =>
  api<{ build: string; hash: string; schema: string; version: string }>("GET", `/editor/books/${encodeURIComponent(bookId)}/draft/latest.json`);

export const putEntity = (bookId: string, ref: string, entity: EntityData) =>
  api<{ entity: EntityData }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/entities/${encodeURIComponent(ref)}`, entity);

export const putTargetEntity = (bookId: string, targetId: string, entity: EntityData | EntityRefData | null) =>
  api<{ target: TreeTarget }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/targets/${encodeURIComponent(targetId)}`, { entity });

/** `replace` = publish although the environment serves another book (else 409 other-book) */
export const publishBook = (bookId: string, env: string, options: { note?: string; replace?: boolean } = {}) =>
  api<PublishResult>("POST", `/editor/books/${encodeURIComponent(bookId)}/publish`, { env, ...options });

/** The draft as a content version – the engine's `loadGameConfiguration({ baseUrl, fetch: authFetch })` reads it */
export const draftBaseUrl = (bookId: string): string => `${API_URL}/editor/books/${encodeURIComponent(bookId)}/draft`;

// ── Assets (docs/server.md "Assets") ─────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  name: string;
  /** `shader`: a source file a plugin loads by its URL (`api.loadText` – #186) */
  kind: AssetType | "shader";
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

/** The kinds a node's or a target's file can be (the content contract's asset types): every asset kind but `shader` */
export type MediaKind = AssetType;
export const isMediaAsset = (asset: Asset): asset is Asset & { kind: MediaKind } => asset.kind !== "shader";

export const listAssets = (bookId: string, kind?: string) =>
  api<{ assets: Asset[] }>("GET", `/editor/books/${encodeURIComponent(bookId)}/assets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);

/** A code file's name (#186): the browser's type for it says nothing true – Windows calls a `.ts` an MPEG stream */
const CODE_FILE = /\.(ts|js|glsl|frag|vert|wgsl)$/i;

/** The file as the body, its name in a header (no multipart); a code file goes as text */
const sendFile = async <T>(method: string, path: string, file: File): Promise<T> => {
  const type = CODE_FILE.test(file.name) ? "text/plain; charset=utf-8" : file.type || "application/octet-stream";
  const sentToken = getToken();
  const response = await authFetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  checkSession(response, sentToken);
  const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string } & Record<string, unknown> } | null;
  if (!response.ok) {
    const { code, message, ...details } = data?.error ?? { code: "unknown", message: "" };
    throw new ApiError(response.status, code ?? "unknown", message || `${response.status} ${response.statusText}`, details);
  }
  return data as T;
};

export const uploadAsset = async (bookId: string, file: File): Promise<Asset> =>
  (await sendFile<{ asset: Asset }>("POST", `/editor/books/${encodeURIComponent(bookId)}/assets`, file)).asset;

export const replaceAsset = (bookId: string, assetId: string, file: File) =>
  sendFile<{ asset: Asset; relinked: number }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/assets/${encodeURIComponent(assetId)}/file`, file);

/** Where a file or a plugin is used: a row of the draft (`entity castle`), or a plugin source that loads the file */
export interface Usage {
  kind: string;
  ref: string;
}

export const assetUsages = (bookId: string, assetId: string) =>
  api<{ usages: Usage[]; asset: Asset }>("GET", `/editor/books/${encodeURIComponent(bookId)}/assets/${encodeURIComponent(assetId)}/usages`);

export const deleteAsset = (bookId: string, assetId: string, force = false) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/assets/${encodeURIComponent(assetId)}${force ? "?force=1" : ""}`);

// ── Targets and entries made in the editor ───────────────────────────────────────────────────────

/** The target's printed image and / or where it is printed */
export const putTarget = (bookId: string, targetId: string, body: { imageSrc?: string; print?: PrintPlacement | null }) =>
  api<{ target: unknown }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/targets/${encodeURIComponent(targetId)}`, body);

export const addEntry = (bookId: string, body: { id?: string; title: string; page: number; category?: string; body?: string; target: { id?: string; imageSrc: string; print?: PrintPlacement; entity?: EntityData | EntityRefData } }) =>
  api<{ entry: { id: string; target: { id: string } }; spreadId: string | null }>("POST", `/editor/books/${encodeURIComponent(bookId)}/entries`, body);

/** The book's world and onion sky (content schema 2.8); `null` removes them – the default applies */
export const putEnvironment = (bookId: string, environment: EnvironmentData | null) =>
  api<{ environment: EnvironmentData | null }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/environment`, { environment });

/** The book's post-processing (schema 2.5) – the master of every spread without a list of its own; `null` removes it */
export const putBookPasses = (bookId: string, passes: PassData[] | null) =>
  api<{ passes: PassData[] | null }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/passes`, { passes });

/** `passes`: the spread's post-processing (schema 2.5); `null` removes the list (the book's applies), `[]` turns it off */
export const putSpread = (bookId: string, spreadId: string, body: { title?: string; format?: SpreadFormat; passes?: PassData[] | null }) =>
  api<{ spread: unknown }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/spreads/${encodeURIComponent(spreadId)}`, body);

/** The rows a new or removed double page renumbered (the later spreads, the entries on their pages, the printed pages) */
export interface MovedRows {
  spreads: number;
  entries: number;
  targets: number;
}

/**
 * A double page (`format: "spread"`, after the spread `after` – default: the last one before the back cover; the later
 * pages are numbered on by two) or a cover (`cover` / `back`)
 */
export const addSpread = (bookId: string, body: { format: Exclude<SpreadFormat, "spread">; title?: string } | { format: "spread"; after?: string; id?: string; title?: string }) =>
  api<{ spread: { id: string; firstPage: number; lastPage: number }; moved: MovedRows }>("POST", `/editor/books/${encodeURIComponent(bookId)}/spreads`, body);

/** A Library file a removal touches: used only by the removed rows, or (`usedBy`) elsewhere too */
export interface RemovalFile {
  id: string;
  name: string;
  kind: string;
  size: number;
  url: string;
  usedBy?: { kind: string; ref: string }[];
}

/** `details.impact` of a 409 confirm-delete (docs/server.md "Removing a spread or an entry") */
export interface RemovalImpact {
  book: string;
  kind: "spread" | "entry";
  spread?: { id: string; title: string; firstPage: number; lastPage: number; format: string };
  entry?: { id: string; title: string; page: number; category: string; spread: string | null };
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

/** What a confirmed removal took (`files` only with `deleteFiles`) and the rows that moved */
export interface RemovalResult {
  deleted: { spread: string | null; entries: string[]; targets: string[]; entities: string[]; files: string[] };
  moved: MovedRows;
}

/**
 * Removes a spread with everything on it, in two steps: without `confirm` the API answers 409 `confirm-delete` with
 * `details.impact` (a `RemovalImpact`) and `details.confirmation` (`removalStep` reads them); the same call with
 * `confirm` (and `deleteFiles` when the person chose it) removes exactly that. 409 `initial-spread` for the opening spread.
 */
export const deleteSpread = (bookId: string, spreadId: string, confirm?: string, deleteFiles = false) =>
  api<RemovalResult>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/spreads/${encodeURIComponent(spreadId)}`, removalBody(confirm, deleteFiles));

/** Removes an entry with its target, its entity and (with `deleteFiles`) the files used only there – the same two steps */
export const deleteEntry = (bookId: string, entryId: string, confirm?: string, deleteFiles = false) =>
  api<RemovalResult>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/entries/${encodeURIComponent(entryId)}`, removalBody(confirm, deleteFiles));

const removalBody = (confirm: string | undefined, deleteFiles: boolean) => (confirm ? { confirm, ...(deleteFiles ? { deleteFiles: true } : {}) } : undefined);

// ── Plugin sources (docs/server.md "Plugin sources") – the Code tab ─────────────────────────────

export interface PluginSummary {
  id: string;
  size: number;
  /** The draft's rows that use a type it registers (the Library's *uses* – #186) */
  usages: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PluginSource extends PluginSummary {
  source: string;
}

export const listPlugins = (bookId: string) => api<{ plugins: PluginSummary[] }>("GET", `/editor/books/${encodeURIComponent(bookId)}/plugins`);

export const getPlugin = (bookId: string, pluginId: string) =>
  api<{ plugin: PluginSource }>("GET", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}`);

export const putPlugin = (bookId: string, pluginId: string, source: string) =>
  api<{ plugin: PluginSource }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}`, { source });

/** Refused while the draft uses a type it registers (409 plugin-in-use with the usages) unless forced */
export const deletePlugin = (bookId: string, pluginId: string, force = false) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}${force ? "?force=1" : ""}`);

/** A script file becomes a new plugin source, its id from the file's name (409 plugin-exists when taken) */
export const uploadPlugin = async (bookId: string, file: File): Promise<PluginSource> =>
  (await sendFile<{ plugin: PluginSource }>("POST", `/editor/books/${encodeURIComponent(bookId)}/plugins`, file)).plugin;

/** A script file replaces a plugin's source */
export const replacePluginFile = async (bookId: string, pluginId: string, file: File): Promise<PluginSource> =>
  (await sendFile<{ plugin: PluginSource }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}/file`, file)).plugin;

/** Where the draft uses what a plugin registers, and what that is (read from its source) */
export const pluginUsages = (bookId: string, pluginId: string) =>
  api<{ usages: Usage[]; registers: Record<string, string[]> }>("GET", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}/usages`);
