import type { EntityData, EntityRefData, GameConfiguration, PassData } from "@engine/types";
import type { EnvironmentData } from "@shared/types/environment";
import type { SpreadFormat } from "@shared/types/game-config";

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

/** A JSON call to the API; errors come back as `ApiError` with the server's code */
export const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await authFetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  /** `editor` when the roles hold it, else `reader` – older field, prefer `roles` */
  role?: string;
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

export interface PublishResult {
  env: string;
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

export interface Version extends PublishResult {
  note?: string | null;
  publishedBy?: string | null;
}

// ── Accounts ────────────────────────────────────────────────────────────────────────────────────

export const requestCode = (email: string) =>
  api<{ requestId: string; expiresAt: string }>("POST", "/auth/request", { email, language: "en" });

export const verifyCode = (requestId: string, code: string) =>
  api<{ session: string; user: User }>("POST", "/auth/verify", { requestId, code });

export const signInWithPassword = (email: string, password: string) =>
  api<{ session: string; user: User }>("POST", "/auth/password", { email, password });

export const me = () => api<{ user: User }>("GET", "/user");

export const logout = () => api<void>("POST", "/auth/logout");

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
  const response = await authFetch(`${API_URL}/admin/users.csv${newsletter ? "?newsletter=1" : ""}`);
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

export const importBook = (bookId: string, body: { configuration: GameConfiguration; files?: unknown; assetsBase?: string } | { source: "cdn" }) =>
  api<{ book: BookSummary }>("POST", `/editor/books/${encodeURIComponent(bookId)}/import`, body);

export const putEntity = (bookId: string, ref: string, entity: EntityData) =>
  api<{ entity: EntityData }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/entities/${encodeURIComponent(ref)}`, entity);

export const putTargetEntity = (bookId: string, targetId: string, entity: EntityData | EntityRefData | null) =>
  api<{ target: TreeTarget }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/targets/${encodeURIComponent(targetId)}`, { entity });

/** `replace` = publish although the environment serves another book (else 409 other-book) */
export const publishBook = (bookId: string, env: string, options: { note?: string; replace?: boolean } = {}) =>
  api<PublishResult>("POST", `/editor/books/${encodeURIComponent(bookId)}/publish`, { env, ...options });

export const listVersions = (bookId: string) => api<{ versions: Version[] }>("GET", `/editor/books/${encodeURIComponent(bookId)}/versions`);

/** The draft as a content version – the engine's `loadGameConfiguration({ baseUrl, fetch: authFetch })` reads it */
export const draftBaseUrl = (bookId: string): string => `${API_URL}/editor/books/${encodeURIComponent(bookId)}/draft`;

// ── Assets (docs/server.md "Assets") ─────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  name: string;
  kind: "glb" | "gltf" | "video" | "image" | "audio";
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

export const listAssets = (bookId: string, kind?: string) =>
  api<{ assets: Asset[] }>("GET", `/editor/books/${encodeURIComponent(bookId)}/assets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);

/** The file as the body, its name in a header (no multipart) */
const sendFile = async <T>(method: string, path: string, file: File): Promise<T> => {
  const response = await authFetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!response.ok) throw new ApiError(response.status, data?.error?.code ?? "unknown", data?.error?.message ?? `${response.status} ${response.statusText}`);
  return data as T;
};

export const uploadAsset = async (bookId: string, file: File): Promise<Asset> =>
  (await sendFile<{ asset: Asset }>("POST", `/editor/books/${encodeURIComponent(bookId)}/assets`, file)).asset;

export const replaceAsset = (bookId: string, assetId: string, file: File) =>
  sendFile<{ asset: Asset; relinked: number }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/assets/${assetId}/file`, file);

export const assetUsages = (bookId: string, assetId: string) =>
  api<{ usages: Array<{ kind: string; ref: string }>; asset: Asset }>("GET", `/editor/books/${encodeURIComponent(bookId)}/assets/${assetId}/usages`);

export const deleteAsset = (bookId: string, assetId: string, force = false) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/assets/${assetId}${force ? "?force=1" : ""}`);

// ── Targets and entries made in the editor ───────────────────────────────────────────────────────

export interface PrintPlacement {
  page?: number;
  surface: "left" | "right" | "front" | "back";
  x: number;
  y: number;
  width: number;
  height?: number;
}

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
export const putSpread = (bookId: string, spreadId: string, body: { title?: string; format?: "spread" | "cover" | "back"; passes?: PassData[] | null }) =>
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
export const addSpread = (bookId: string, body: { format: "cover" | "back"; title?: string } | { format: "spread"; after?: string; id?: string; title?: string }) =>
  api<{ spread: { id: string; firstPage: number; lastPage: number }; moved: MovedRows }>("POST", `/editor/books/${encodeURIComponent(bookId)}/spreads`, body);

/** Removes a spread without entries (409 `spread-not-empty` / `initial-spread` otherwise); a double page's later pages are numbered back */
export const deleteSpread = (bookId: string, spreadId: string) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/spreads/${encodeURIComponent(spreadId)}`);

export const deleteEntry = (bookId: string, entryId: string) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/entries/${encodeURIComponent(entryId)}`);

// ── Plugin sources (docs/server.md "Plugin sources") – the Code tab ─────────────────────────────

export interface PluginSummary {
  id: string;
  size: number;
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

export const deletePlugin = (bookId: string, pluginId: string) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}`);
