/**
 * The guide to connect an AI agent beside the AI connections on the books page (docs/editor.md "AI connections"). Any
 * MCP client that starts a stdio server needs the same four things: a name for the server, the command
 * `node <file>`, and the environment `OSCT_API_URL` (this instance's API) and `OSCT_EDITOR_TOKEN` (a token from the
 * list). The builders here write them for the generic block and as each client's own snippet. A token just made is
 * filled in, else a placeholder; the file is the MCP server in the person's own checkout (docs/mcp.md), typed once on
 * the page – the editor cannot know it.
 */

export const TOKEN_PLACEHOLDER = "osct_…";
/** The MCP server's start inside a checkout of the repository */
export const SERVER_FILE = "mcp/bin/osct-mcp.mjs";
/** Shown in every snippet until the person has typed the path */
export const FILE_PLACEHOLDER = `/path/to/osct/${SERVER_FILE}`;

export const CLIENTS = ["claude-code", "claude-desktop", "codex", "opencode", "cursor"] as const;
export type McpClient = (typeof CLIENTS)[number];

/** Each client's label on its pill, its short name in a suggested token name, and where its snippet goes */
export const CLIENT_INFO: Record<McpClient, { label: string; agent: string; where: string }> = {
  "claude-code": { label: "Claude Code", agent: "Claude Code", where: "A command for the terminal" },
  "claude-desktop": { label: "Claude Desktop", agent: "Claude Desktop", where: "The entry for claude_desktop_config.json" },
  codex: { label: "Codex CLI", agent: "Codex", where: "The table for ~/.codex/config.toml" },
  opencode: { label: "OpenCode", agent: "OpenCode", where: "The entry for opencode.json" },
  cursor: { label: "Cursor", agent: "Cursor", where: "The entry for .cursor/mcp.json" },
};

/** What one snippet is made of: the server's name, this instance's API, the token (null = placeholder), the server file ("" = placeholder) */
export interface McpSetup {
  name: string;
  api: string;
  token: string | null;
  file: string;
}

/** This instance's API as an absolute URL: the editor's `API_URL` (`/api` next to the app) against the page's origin */
export function apiUrlFor(apiUrl: string, origin: string): string {
  return new URL(apiUrl, `${origin.replace(/\/+$/, "")}/`).href.replace(/\/+$/, "");
}

/**
 * The name a client lists this instance's server under: `osct-<env>` after the environment `GET /health` names
 * (`osct-local`, `osct-staging`, `osct-production` – the API's environment-name rule makes it a valid name), so the
 * servers of several instances sit side by side and none takes the name `osct` of the repository's own `.mcp.json`
 * (the local dev API) – in Claude Code a project's server hides a user server of the same name.
 */
export function serverNameFor(env: string): string {
  return `osct-${env}`;
}
/** Shown in every snippet until `GET /health` has named the environment */
export const SERVER_NAME_PLACEHOLDER = "osct-…";

/**
 * The server file from what the person typed: surrounding quotes go (a copied Windows path has them); a folder – the
 * checkout itself – gets `mcp/bin/osct-mcp.mjs` appended with the separator the path already uses.
 */
export function serverFileFrom(input: string): string {
  const path = input.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!path) return "";
  if (/\.m?js$/i.test(path)) return path;
  const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  return `${path.replace(/[\\/]+$/, "")}${separator}${SERVER_FILE.split("/").join(separator)}`;
}

/** A token's name that says which agent on which machine (it names the agent in the change log) */
export function tokenNameFor(client: McpClient): string {
  return `${CLIENT_INFO[client].agent} on my laptop`;
}

const fileOf = (setup: McpSetup) => setup.file || FILE_PLACEHOLDER;

/** The environment the server reads */
export function envOf(setup: McpSetup): { OSCT_API_URL: string; OSCT_EDITOR_TOKEN: string } {
  return { OSCT_API_URL: setup.api, OSCT_EDITOR_TOKEN: setup.token ?? TOKEN_PLACEHOLDER };
}

/** One argument for a POSIX shell (bash, zsh; PowerShell reads it the same unless it holds a single quote) */
export function shellArg(value: string): string {
  return /^[\w/.:=@%+,~…-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

/** The command any client starts: `node <file>` */
export function commandLine(setup: McpSetup): string {
  return `node ${shellArg(fileOf(setup))}`;
}

/**
 * Claude Code: one command for every project of this computer (`--scope user`). The name comes first: right after
 * `-e` the CLI would read it as another variable. https://code.claude.com/docs/en/mcp
 */
export function claudeCodeCommand(setup: McpSetup): string {
  const env = Object.entries(envOf(setup)).map(([key, value]) => `-e ${shellArg(`${key}=${value}`)}`).join(" ");
  return `claude mcp add ${setup.name} --scope user ${env} -- ${commandLine(setup)}`;
}

/**
 * Claude Desktop: the `mcpServers` entry of claude_desktop_config.json (Settings → Developer → Edit Config).
 * https://modelcontextprotocol.io/docs/develop/connect-local-servers
 */
export function claudeDesktopConfig(setup: McpSetup): string {
  return JSON.stringify({ mcpServers: { [setup.name]: { command: "node", args: [fileOf(setup)], env: envOf(setup) } } }, null, 2);
}

/** A TOML basic string: backslash, quote and control characters escaped */
export function tomlString(value: string): string {
  const escaped = value.replace(/[\\"\u0000-\u001f\u007f]/g, c =>
    c === "\\" ? "\\\\" : c === '"' ? '\\"' : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `"${escaped}"`;
}

const tomlKey = (key: string) => (/^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key));

/**
 * Codex CLI: the `[mcp_servers.<name>]` table of ~/.codex/config.toml with `command`, `args` and its `env` table.
 * https://developers.openai.com/codex/mcp
 */
export function codexConfig(setup: McpSetup): string {
  const table = `mcp_servers.${tomlKey(setup.name)}`;
  const env = Object.entries(envOf(setup)).map(([key, value]) => `${key} = ${tomlString(value)}`);
  return [`[${table}]`, `command = "node"`, `args = [${tomlString(fileOf(setup))}]`, "", `[${table}.env]`, ...env].join("\n");
}

/**
 * OpenCode: a local server under `mcp` in opencode.json – `command` is one array, the variables are `environment`.
 * https://opencode.ai/docs/mcp-servers/
 */
export function opencodeConfig(setup: McpSetup): string {
  const server = { type: "local", command: ["node", fileOf(setup)], enabled: true, environment: envOf(setup) };
  return JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { [setup.name]: server } }, null, 2);
}

/**
 * Cursor: the `mcpServers` entry of .cursor/mcp.json (a project) or ~/.cursor/mcp.json (every project), `type: stdio`.
 * https://cursor.com/docs/context/mcp
 */
export function cursorConfig(setup: McpSetup): string {
  return JSON.stringify({ mcpServers: { [setup.name]: { type: "stdio", command: "node", args: [fileOf(setup)], env: envOf(setup) } } }, null, 2);
}

export function snippetFor(client: McpClient, setup: McpSetup): string {
  switch (client) {
    case "claude-code": return claudeCodeCommand(setup);
    case "claude-desktop": return claudeDesktopConfig(setup);
    case "codex": return codexConfig(setup);
    case "opencode": return opencodeConfig(setup);
    case "cursor": return cursorConfig(setup);
  }
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
