import type { EntityData, EntityRefData, GameConfiguration } from "@engine/types";

/**
 * The instance's API (server/api, docs/server.md): the accounts endpoints the sign-in uses and the editor's own
 * `/editor/*`. `VITE_API_URL` names it (default `/api`, next to the app – the dev server proxies it to the PHP dev
 * API). The session token lives in `localStorage`; `authFetch` is the `fetch` the engine's content loader uses for
 * the draft, so the draft endpoints see the token too.
 */

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/+$/, "");

const TOKEN_KEY = "osct-editor-session";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
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
  const data = (await response.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code ?? "unknown", data?.error?.message ?? `${response.status} ${response.statusText}`);
  }
  return data as T;
};

// ── Shapes ───────────────────────────────────────────────────────────────────────────────────────

export interface User {
  email: string;
  language: string;
  role?: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  spreads: number;
  updatedAt: string;
  lastPublish?: { env: string; build: string; at: string } | null;
}

export interface TreeTarget {
  id: string;
  imageSrc: string;
  entity?: EntityData | EntityRefData;
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
  entries: TreeEntry[];
}

export interface BookTree {
  book: BookSummary & { assetsBase?: string | null; schema?: string };
  spreads: TreeSpread[];
}

export interface PublishResult {
  env: string;
  build: string;
  hash: string;
  publishedAt: string;
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

// ── Editor ──────────────────────────────────────────────────────────────────────────────────────

export const listBooks = () => api<{ books: BookSummary[] }>("GET", "/editor/books");

export const getBook = (bookId: string) => api<BookTree>("GET", `/editor/books/${encodeURIComponent(bookId)}`);

export const importBook = (bookId: string, body: { configuration: GameConfiguration; files?: unknown; assetsBase?: string } | { source: "cdn" }) =>
  api<{ book: BookSummary }>("POST", `/editor/books/${encodeURIComponent(bookId)}/import`, body);

export const putEntity = (bookId: string, ref: string, entity: EntityData) =>
  api<{ entity: EntityData }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/entities/${encodeURIComponent(ref)}`, entity);

export const putTargetEntity = (bookId: string, targetId: string, entity: EntityData | EntityRefData | null) =>
  api<{ target: TreeTarget }>("PUT", `/editor/books/${encodeURIComponent(bookId)}/targets/${encodeURIComponent(targetId)}`, { entity });

export const publishBook = (bookId: string, env: string, note?: string) =>
  api<PublishResult>("POST", `/editor/books/${encodeURIComponent(bookId)}/publish`, { env, note });

export const listVersions = (bookId: string) => api<{ versions: Version[] }>("GET", `/editor/books/${encodeURIComponent(bookId)}/versions`);

/** The draft as a content version – the engine's `loadGameConfiguration({ baseUrl, fetch: authFetch })` reads it */
export const draftBaseUrl = (bookId: string): string => `${API_URL}/editor/books/${encodeURIComponent(bookId)}/draft`;
