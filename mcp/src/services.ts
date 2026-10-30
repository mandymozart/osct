// Who the user is and which service their roles open (docs/server.md "Roles"): the editor's tools are listed for the
// role `editor` only – the API's role checks still decide every call. Plus the editor app's links every result hands
// back: the person checks the draft on the stage and publishes to readers there.
import type { OsctApi } from "./api.ts";
import type { Config } from "./config.ts";

export interface User {
  email: string;
  roles: string[];
  language: string;
  /** the AI connection's token the server signed in with (made on the editor's books page), null for a session */
  token: TokenInfo | null;
}

/** An AI connection's token as `GET /user` names it (never the token itself) */
export interface TokenInfo {
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface Services {
  /** the role `editor`: books, drafts, assets, plugin sources */
  editor: boolean;
  /** the role `admin` – no tools here (the admin page is small and a person's); shown in whoami */
  admin: boolean;
}

export function servicesOf(roles: readonly string[]): Services {
  return { editor: roles.includes("editor"), admin: roles.includes("admin") };
}

/** The user behind the token (`GET /user`, which names an AI connection's token too); null without a token */
export async function fetchUser(api: OsctApi): Promise<User | null> {
  if (!api.hasToken) return null;
  const { user, token } = await api.call<{ user: { email: string; roles?: string[]; language?: string }; token?: Partial<TokenInfo> }>("GET", "/user");
  return {
    email: user.email,
    roles: Array.isArray(user.roles) ? user.roles.map(String) : [],
    language: user.language ?? "en",
    token: token?.name ? { name: token.name, prefix: token.prefix ?? "", expiresAt: token.expiresAt ?? null, lastUsedAt: token.lastUsedAt ?? null } : null,
  };
}

export interface AppLinks {
  /** the editor app, no trailing slash */
  editor: string;
}

export const appLinks = (config: Config): AppLinks => ({ editor: config.editor });

/** The editor's page of a book, a spread of it, or the books list */
export function editorHref(links: AppLinks, book?: string, spread?: string | null): string {
  if (!book) return `${links.editor}/`;
  if (!spread) return `${links.editor}/${encodeURIComponent(book)}/`;
  return `${links.editor}/${encodeURIComponent(book)}/${encodeURIComponent(spread)}/`;
}
