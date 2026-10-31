import type { EntityData, EntityRefData, GameConfiguration, PassData } from "@engine/types";
import type { EnvironmentData } from "@shared/types/environment";
import type { AssetType, PrintPlacement, SpreadFormat, StepData } from "@shared/types/game-config";
import type {
  Asset,
  AssetList,
  AssetReplaced,
  AssetUploaded,
  AssetUsages,
  BookList,
  BookPassesSaved,
  BookSaved,
  BookTree,
  DraftManifest,
  EntitySaved,
  EntryAdded,
  EntryList,
  EntrySaved,
  EnvironmentSaved,
  EnvironmentsInfo,
  ImportPreview,
  ImportResult,
  PluginSource,
  PluginSummary,
  PluginUsages,
  PublishResult,
  RemovalResult,
  SpreadAdded,
  SpreadSaved,
  TargetSaved,
  TutorialSaved,
} from "@shared/api/editor";
import { apiErrorFields } from "@shared/api/errors";
import { readStored, writeStored } from "#lib/storage.js";

export type { PrintPlacement };
// The editor API's answers, typed once for the editor and the MCP server (shared/api/editor.ts)
export type {
  Asset,
  BookSummary,
  BookTree,
  Confirmation,
  EditorEntry,
  EntryFields,
  EntrySaved,
  EnvironmentInfo,
  EnvironmentServing,
  EnvironmentsInfo,
  ImportComparison,
  ImportedBuild,
  ImportPreview,
  LiveIn,
  MovedRows,
  OtherBook,
  PluginSource,
  PluginSummary,
  PublishResult,
  RemovalFile,
  RemovalImpact,
  RemovalResult,
  TreeEntry,
  TreeSpread,
  Usage,
} from "@shared/api/editor";

/**
 * The instance's API (server/api, docs/server.md): the accounts endpoints the sign-in uses and the editor's own
 * `/editor/*`. `VITE_API_URL` names it (default `/api`, next to the app on the same origin – the dev server proxies it
 * to the PHP dev API). The session is the API's HttpOnly cookie (#207, docs/server.md "Sessions, cookies and CSRF"): no
 * script on the page can read it, and nothing about it is in `localStorage`. What the editor holds is the session's
 * CSRF token, in memory only, sent with every write. `authFetch` is the `fetch` the engine's content loader uses for
 * the draft – the cookie goes with it. Every call goes through `request`: the cookie and the CSRF token, the end of a
 * session on a 401, a stale CSRF token renewed once, the API's errors as `ApiError`, and the book's tree read again
 * after a write to the book.
 */

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/+$/, "");

/**
 * Where the editor kept the session token before the cookie (#207). TEMPORARY: read once at startup, exchanged for the
 * cookie (`exchangeStoredToken`) and removed – drop with the exchange endpoint (MEMORY open item).
 */
const LEGACY_TOKEN_KEY = "osct-editor-session";

export class ApiError extends Error {
  /** `details` = the rest of the server's error object (e.g. `current` of a 409 other-book) */
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

/** An error as a line for the page: the API's message (with its code when `code`), an error's message, else the value */
export const errorText = (error: unknown, { code = false }: { code?: boolean } = {}): string => {
  if (error instanceof ApiError) return code ? `${error.message} (${error.code})` : error.message;
  return error instanceof Error ? error.message : String(error);
};

/**
 * The books' trees as read since the last write to each (the workspace's stage, environment and top bar share one
 * read): `getBook` answers from here, every write to a book (`POST` / `PUT` / `DELETE /editor/books/{id}/…`) drops the
 * book's – the next read asks the API again –, as does a failed read and a new session
 */
const trees = new Map<string, Promise<BookTree>>();

/**
 * The signed-in session as the editor knows it – never the session token, which only the cookie holds: the CSRF token
 * the API handed out (sent in `X-CSRF-Token` with every write) and whose session it is. Memory only. Each sign-in is a
 * new object, so a call can tell whether the session it was sent in is still the one.
 */
export interface SessionKey {
  csrfToken: string;
  email: string;
}

let current: SessionKey | null = null;

/** The session the editor is signed in to, or null */
export const getSession = (): SessionKey | null => current;

/** A sign-in (the API's CSRF token and the user's address) or none (a sign-out, an ended session): the trees read before are dropped */
export const setSession = (session: { csrfToken: string; email: string } | null): void => {
  current = session ? { csrfToken: session.csrfToken, email: session.email } : null;
  trees.clear();
};

const WRITE = /^(POST|PUT|PATCH|DELETE)$/i;

/**
 * `fetch` with the session: the cookie (same origin – the API is `/api` next to the editor) and, on a write, the CSRF
 * token – also handed to the engine for the draft content. Never an `Authorization` header: that is for the AI
 * connections' tokens and the MCP server, not the person's session in a browser.
 */
export const authFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  const method = init.method ?? (input instanceof Request ? input.method : "GET");
  if (current && WRITE.test(method)) headers.set("X-CSRF-Token", current.csrfToken);
  return fetch(input, { credentials: "same-origin", ...init, headers });
};

/** Called when the session ended under the page (a 401 while signed in) – the session store registers it */
let sessionEnded: (() => void) | null = null;

/** Who hears that the session ended (`session.svelte.ts`); null: nobody */
export const onSessionEnd = (handler: (() => void) | null): void => {
  sessionEnded = handler;
};

/** The session ended under the page: forgotten here, and the session store hears it */
const endSession = (): void => {
  setSession(null);
  sessionEnded?.();
};

/**
 * A 401 to a call sent while signed in means the session is gone (expired, signed out elsewhere – the reader shares the
 * cookie –, the account's roles revoked): the session store hears it. Not when another sign-in happened meanwhile, nor
 * when the call was sent signed out – then a 401 is only "not signed in".
 */
const checkSession = (response: Response, sent: SessionKey | null): void => {
  if (response.status !== 401 || sent === null || current !== sent) return;
  endSession();
};

/**
 * A write refused with 403 `csrf` while signed in: the CSRF token the editor holds is not the cookie's session's any
 * more – the cookie was replaced in this browser (a sign-in in the reader shares it, docs/server.md). The session's
 * token is read again from `GET /user`, once; when the cookie now belongs to someone else, the editor's session ended.
 * True when the write may be sent again.
 */
const renewCsrf = async (sent: SessionKey): Promise<boolean> => {
  if (current !== sent) return current !== null;
  const response = await fetch(`${API_URL}/user`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (current !== sent || response === null) return false;
  const body = (await response.json().catch(() => null)) as { user?: { email?: string }; csrfToken?: string } | null;
  if (response.status === 401 || (response.ok && body?.user?.email !== sent.email)) {
    endSession();
    return false;
  }
  if (!response.ok || typeof body?.csrfToken !== "string") return false;
  sent.csrfToken = body.csrfToken; // the same sign-in, the cookie's new session
  return true;
};

/** The API's error answer as an `ApiError` (shared/api/errors.ts reads it – an answer that is no JSON too) */
const errorOf = async (response: Response): Promise<ApiError> => {
  const { code, message, details } = apiErrorFields(response.status, response.statusText, await response.json().catch(() => null));
  return new ApiError(response.status, code, message, details);
};

/** The book a path of the editor API is about, or null */
const bookOfPath = (path: string): string | null => {
  const match = /^\/editor\/books\/([^/?]+)/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
};

/** A 403 `csrf` answer (read from a clone – the caller may still read the original) */
const isCsrfRefusal = async (response: Response): Promise<boolean> => {
  if (response.status !== 403) return false;
  const body = (await response.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
  return body?.error?.code === "csrf";
};

/**
 * One call to the API: the cookie and, on a write, the CSRF token; a 403 `csrf` renews the token and sends the write
 * once more; a 401 that ends the session (unless `unauthorizedIsAnswer`), an error answer as `ApiError`; after a write
 * to a book (answered or not) its tree is read again
 */
const request = async (method: string, path: string, init: RequestInit, { unauthorizedIsAnswer = false } = {}): Promise<Response> => {
  const sent = current;
  try {
    let response = await authFetch(`${API_URL}${path}`, { ...init, method });
    if (sent !== null && WRITE.test(method) && (await isCsrfRefusal(response)) && (await renewCsrf(sent))) {
      response = await authFetch(`${API_URL}${path}`, { ...init, method });
    }
    if (!unauthorizedIsAnswer) checkSession(response, sent);
    if (!response.ok) throw await errorOf(response);
    return response;
  } finally {
    const book = method === "GET" ? null : bookOfPath(path);
    if (book !== null) trees.delete(book);
  }
};

/**
 * A JSON call to the API; errors come back as `ApiError` with the server's code. A 401 ends the session
 * (`checkSession`) unless `unauthorizedIsAnswer`: the sign-in calls (a wrong code or password), the sign-out and
 * the startup check of a stored token, where a 401 is the expected answer and the caller handles it.
 */
export const api = async <T>(method: string, path: string, body?: unknown, options: { unauthorizedIsAnswer?: boolean } = {}): Promise<T> => {
  const response = await request(method, path, {
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, options);
  if (response.status === 204) return undefined as T;
  return (await response.json().catch(() => null)) as T;
};

// ── Shapes of the accounts and admin endpoints ─────────────────────────────────────────────────

/** The account (docs/server.md): `roles` has `reader` for everyone, `editor` (the editor), `admin` (the admin page) */
export interface User {
  email: string;
  language: string;
  options: Record<string, boolean>;
  hasPassword: boolean;
  roles: string[];
  createdAt: string;
}

// ── Accounts ────────────────────────────────────────────────────────────────────────────────────

// A 401 here is an answer the caller handles (a wrong password, a token checked at startup), not a lost session
const signIn = { unauthorizedIsAnswer: true };

export const requestCode = (email: string) =>
  api<{ requestId: string; expiresAt: string }>("POST", "/auth/request", { email, language: "en" }, signIn);

/**
 * What a browser's sign-in answers (`session: "cookie"`): the session is the cookie the answer set, the CSRF token is
 * for the writes (`setSession`) – never the session token itself
 */
export interface SignedIn {
  csrfToken: string;
  user: User;
}

export const verifyCode = (requestId: string, code: string) =>
  api<SignedIn>("POST", "/auth/verify", { requestId, code, session: "cookie" }, signIn);

export const signInWithPassword = (email: string, password: string) =>
  api<SignedIn>("POST", "/auth/password", { email, password, session: "cookie" }, signIn);

/** The signed-in user and the cookie session's CSRF token (401 when the browser has no session) */
export const me = () => api<{ user: User; csrfToken?: string }>("GET", "/user", undefined, signIn);

export const logout = () => api<void>("POST", "/auth/logout", undefined, signIn);

/**
 * TEMPORARY (#207 – remove with `POST /auth/cookie`, MEMORY open item): a session token the editor kept in
 * `localStorage` before the cookie is sent once to the exchange endpoint, which sets the cookie; the stored token is
 * removed once the API took it or refused it (401 / 403). Null when nothing was stored or the token no longer holds
 * (sign in as usual); a network failure or a server error keeps it for the next start.
 */
export const exchangeStoredToken = async (): Promise<SignedIn | null> => {
  const token = readStored(LEGACY_TOKEN_KEY);
  if (token === null) return null;
  if (token === "") {
    writeStored(LEGACY_TOKEN_KEY, null);
    return null;
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/cookie`, { method: "POST", credentials: "same-origin", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (response.ok || response.status === 401 || response.status === 403) writeStored(LEGACY_TOKEN_KEY, null);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as Partial<SignedIn> | null;
  return body && typeof body.csrfToken === "string" && body.user ? { csrfToken: body.csrfToken, user: body.user } : null;
};

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

/** The instance's health: its version and its environment (`local`, `staging`, `production`, …) */
export interface Health {
  status: string;
  version: string;
  env: string;
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
  const response = await request("GET", `/admin/users.csv${newsletter ? "?newsletter=1" : ""}`, {});
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "users.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

// ── Editor ──────────────────────────────────────────────────────────────────────────────────────

export const listBooks = () => api<BookList>("GET", "/editor/books");

/**
 * The book's tree, read once and shared until a write to the book (`trees`); `fresh` asks the API in any case – a page
 * that shows the whole tree when it opens (the book page) sees what others changed meanwhile
 */
export const getBook = (bookId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<BookTree> => {
  const cached = fresh ? undefined : trees.get(bookId);
  if (cached) return cached;
  const read = api<BookTree>("GET", `/editor/books/${encodeURIComponent(bookId)}`);
  trees.set(bookId, read);
  read.catch(() => {
    if (trees.get(bookId) === read) trees.delete(bookId);
  });
  return read;
};

/** What an import sends: a configuration, or the instance CDN's current version – `confirm` = the second step */
export type ImportSource = { configuration: GameConfiguration; files?: unknown; assetsBase?: string } | { source: "cdn" };
export type ImportBody = ImportSource & { confirm?: string };

/** What the import of this body would bring in and replace – read-only; 502 content-fetch-failed names the `url` */
export const previewImport = (body: ImportSource) => api<ImportPreview>("POST", "/editor/import/preview", body);

/**
 * Imports into the book. Over a book that exists the API answers 409 `confirm-import` (or `confirmation-void`) with
 * `details.comparison` (an `ImportComparison`) and `details.confirmation` – `confirmationStep(error, "import")` reads
 * them; the same call with `confirm` then imports.
 */
export const importBook = (bookId: string, body: ImportBody) => api<ImportResult>("POST", `/editor/books/${encodeURIComponent(bookId)}/import`, body);

/** This instance's environments (`GET /editor/environments`): the one it publishes to, each one's backend */
export const listEnvironments = () => api<EnvironmentsInfo>("GET", "/editor/environments");

/** The draft's manifest: its build now (what a publish would write) */
export const getDraftManifest = (bookId: string) => api<DraftManifest>("GET", `/editor/books/${encodeURIComponent(bookId)}/draft/latest.json`);

export const putEntity = (bookId: string, ref: string, entity: EntityData) =>
  api<EntitySaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/entities/${encodeURIComponent(ref)}`, entity);

export const putTargetEntity = (bookId: string, targetId: string, entity: EntityData | EntityRefData | null) =>
  api<TargetSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/targets/${encodeURIComponent(targetId)}`, { entity });

/** `replace` = publish although the environment serves another book (else 409 other-book) */
export const publishBook = (bookId: string, env: string, options: { note?: string; replace?: boolean } = {}) =>
  api<PublishResult>("POST", `/editor/books/${encodeURIComponent(bookId)}/publish`, { env, ...options });

/** The draft as a content version – the engine's `loadGameConfiguration({ baseUrl, fetch: authFetch })` reads it */
export const draftBaseUrl = (bookId: string): string => `${API_URL}/editor/books/${encodeURIComponent(bookId)}/draft`;

// ── Assets (docs/server.md "Assets") ─────────────────────────────────────────────────────────────

/** The kinds a node's or a target's file can be (the content contract's asset types): every asset kind but `shader` */
export type MediaKind = AssetType;
export const isMediaAsset = (asset: Asset): asset is Asset & { kind: MediaKind } => asset.kind !== "shader";

export const listAssets = (bookId: string, kind?: string) =>
  api<AssetList>("GET", `/editor/books/${encodeURIComponent(bookId)}/assets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);

/** A code file's name: the browser's type for it says nothing true – Windows calls a `.ts` an MPEG stream */
const CODE_FILE = /\.(ts|js|glsl|frag|vert|wgsl)$/i;

/** The file as the body, its name in a header (no multipart); a code file goes as text */
const sendFile = async <T>(method: string, path: string, file: File): Promise<T> => {
  const type = CODE_FILE.test(file.name) ? "text/plain; charset=utf-8" : file.type || "application/octet-stream";
  const response = await request(method, path, { headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) }, body: file });
  return (await response.json().catch(() => null)) as T;
};

export const uploadAsset = async (bookId: string, file: File): Promise<Asset> =>
  (await sendFile<AssetUploaded>("POST", `/editor/books/${encodeURIComponent(bookId)}/assets`, file)).asset;

export const replaceAsset = (bookId: string, assetId: string, file: File) =>
  sendFile<AssetReplaced>("PUT", `/editor/books/${encodeURIComponent(bookId)}/assets/${encodeURIComponent(assetId)}/file`, file);

export const assetUsages = (bookId: string, assetId: string) =>
  api<AssetUsages>("GET", `/editor/books/${encodeURIComponent(bookId)}/assets/${encodeURIComponent(assetId)}/usages`);

export const deleteAsset = (bookId: string, assetId: string, force = false) =>
  api<void>("DELETE", `/editor/books/${encodeURIComponent(bookId)}/assets/${encodeURIComponent(assetId)}${force ? "?force=1" : ""}`);

// ── Targets and entries made in the editor ───────────────────────────────────────────────────────

/** The target's printed image and / or where it is printed */
export const putTarget = (bookId: string, targetId: string, body: { imageSrc?: string; print?: PrintPlacement | null }) =>
  api<TargetSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/targets/${encodeURIComponent(targetId)}`, body);

/** A new entry – with its target, or without one: an entry read only in the list (the Entries page, #223) */
export const addEntry = (bookId: string, body: { id?: string; title: string; page: number; category?: string; body?: string; target?: { id?: string; imageSrc: string; print?: PrintPlacement; entity?: EntityData | EntityRefData } }) =>
  api<EntryAdded>("POST", `/editor/books/${encodeURIComponent(bookId)}/entries`, body);

// ── The book's texts (#223, docs/server.md "Texts") ──────────────────────────────────────────────

/** Every entry with its fields as the content holds them (an image's path unresolved), its spread and its target */
export const getEntries = (bookId: string) => api<EntryList>("GET", `/editor/books/${encodeURIComponent(bookId)}/entries`);

/** An entry's fields – only those sent change; `null` removes author, image or media. A new page can move it to another spread */
export const putEntry = (bookId: string, entryId: string, changes: Record<string, unknown>) =>
  api<EntrySaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/entries/${encodeURIComponent(entryId)}`, changes);

/** The book's title, author and publisher (`publisher: null` removes it) */
export const putBookTexts = (bookId: string, changes: { title?: string; author?: string; publisher?: string | null }) =>
  api<BookSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}`, changes);

/** The onboarding's steps in their order */
export const getTutorial = (bookId: string) => api<TutorialSaved>("GET", `/editor/books/${encodeURIComponent(bookId)}/tutorial`);

/** The onboarding's steps – the whole ordered list */
export const putTutorial = (bookId: string, tutorial: StepData[]) =>
  api<TutorialSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/tutorial`, { tutorial });

/** The book's world and onion sky; `null` removes them – the default applies */
export const putEnvironment = (bookId: string, environment: EnvironmentData | null) =>
  api<EnvironmentSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/environment`, { environment });

/** The book's post-processing – the master of every spread without a list of its own; `null` removes it */
export const putBookPasses = (bookId: string, passes: PassData[] | null) =>
  api<BookPassesSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/passes`, { passes });

/** `passes`: the spread's post-processing; `null` removes the list (the book's applies), `[]` turns it off */
export const putSpread = (bookId: string, spreadId: string, body: { title?: string; format?: SpreadFormat; passes?: PassData[] | null }) =>
  api<SpreadSaved>("PUT", `/editor/books/${encodeURIComponent(bookId)}/spreads/${encodeURIComponent(spreadId)}`, body);

/**
 * A double page (`format: "spread"`, after the spread `after` – default: the last one before the back cover; the later
 * pages are numbered on by two) or a cover (`cover` / `back`)
 */
export const addSpread = (bookId: string, body: { format: Exclude<SpreadFormat, "spread">; title?: string } | { format: "spread"; after?: string; id?: string; title?: string }) =>
  api<SpreadAdded>("POST", `/editor/books/${encodeURIComponent(bookId)}/spreads`, body);

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
  api<PluginUsages>("GET", `/editor/books/${encodeURIComponent(bookId)}/plugins/${encodeURIComponent(pluginId)}/usages`);
