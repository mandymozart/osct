// Where the server talks to and as whom: `OSCT_API_URL` (default: the local dev API) and `OSCT_EDITOR_TOKEN` (an AI
// connection's token `osct_…` made on the editor's books page, or an editor's session token; sent as
// `Authorization: Bearer`). Without a token the server starts with the sign-in tools only – `sign_in_request` /
// `sign_in_verify` fetch one for this process (the code arrives by mail). `OSCT_EDITOR_URL`
// names the editor app whose links every result hands back; its default follows the API (the local dev server, or
// `/editor` next to a deployed API).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** the repository root (mcp/src → ../..) */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOCAL_API = "http://127.0.0.1:8080/api";
const LOCAL_EDITOR = "http://localhost:5175/editor";

export interface Config {
  api: string;
  /** the editor app (links in the results); no trailing slash */
  editor: string;
  token: string;
  /** where the token came from (shown in the server's log, never the token) */
  tokenSource: "env" | "none";
  local: boolean;
}

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `/editor` next to the API's `/api` – a deployed instance serves both from one origin */
export function editorUrlFor(api: string): string {
  if (isLocalUrl(api)) return LOCAL_EDITOR;
  try {
    return `${new URL(api).origin}/editor`;
  } catch {
    return LOCAL_EDITOR;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const api = (env.OSCT_API_URL?.trim() || LOCAL_API).replace(/\/+$/, "");
  const editor = (env.OSCT_EDITOR_URL?.trim() || editorUrlFor(api)).replace(/\/+$/, "");
  const token = env.OSCT_EDITOR_TOKEN?.trim() || "";
  return { api, editor, token, tokenSource: token ? "env" : "none", local: isLocalUrl(api) };
}
