/**
 * The MCP guide beside the AI connections on the books page (docs/editor.md "AI connections"): this instance's API as
 * the server URL, and the setup snippets for Claude Code and Claude Desktop – a token just made is filled in, else a
 * placeholder. The MCP server runs from a checkout of the repository (docs/mcp.md), so its path stays a placeholder.
 */

export const TOKEN_PLACEHOLDER = "osct_…";
export const SERVER_PATH = "<path to osct>/mcp/bin/osct-mcp.mjs";
/** The name the client lists the server under */
export const SERVER_NAME = "osct";

export type McpClient = "code" | "desktop";

/** This instance's API as an absolute URL: the editor's `API_URL` (`/api` next to the app) against the page's origin */
export function apiUrlFor(apiUrl: string, origin: string): string {
  return new URL(apiUrl, `${origin.replace(/\/+$/, "")}/`).href.replace(/\/+$/, "");
}

/** Claude Code: one command, for every project of this computer (`--scope user`) */
export function claudeCodeCommand(api: string, token: string | null): string {
  return `claude mcp add ${SERVER_NAME} --scope user -e OSCT_API_URL=${api} -e OSCT_EDITOR_TOKEN=${token ?? TOKEN_PLACEHOLDER} -- node ${SERVER_PATH}`;
}

/** Claude Desktop: the `mcpServers` entry of claude_desktop_config.json */
export function claudeDesktopConfig(api: string, token: string | null): string {
  const config = { mcpServers: { [SERVER_NAME]: { command: "node", args: [SERVER_PATH], env: { OSCT_API_URL: api, OSCT_EDITOR_TOKEN: token ?? TOKEN_PLACEHOLDER } } } };
  return JSON.stringify(config, null, 2);
}

export function snippetFor(client: McpClient, api: string, token: string | null): string {
  return client === "code" ? claudeCodeCommand(api, token) : claudeDesktopConfig(api, token);
}

/** When a token was last used, in words: never, just now, 5 min ago, 3 h ago, yesterday, 12 days ago */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** A day as the list shows it: 30 Apr 2027 */
export function day(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** Expires within `days` (renew it soon) – false for none or one already expired */
export function expiresSoon(iso: string | null, now = Date.now(), days = 14): boolean {
  if (!iso) return false;
  const left = Date.parse(iso) - now;
  return left > 0 && left < days * 86400_000;
}
