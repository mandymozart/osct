// stdio entry: `node bin/osct-mcp.mjs` (Claude Code starts it from the repository's .mcp.json – docs/mcp.md). Logs go
// to stderr only – stdout is the MCP channel.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { OsctApi } from "./api.ts";
import { loadConfig } from "./config.ts";
import { fetchUser, servicesOf } from "./services.ts";
import { createUserServer } from "./user.ts";

try {
  const config = loadConfig();
  const api = new OsctApi(config.api, config.token);
  let user = null;
  try {
    user = await fetchUser(api);
  } catch (error) {
    // a dead token or an API that is down: the server still starts (whoami says what is wrong)
    console.error(`osct-mcp: ${config.api} – ${error instanceof Error ? error.message : error}`);
  }
  const server = createUserServer(config, api, user);
  await server.connect(new StdioServerTransport());
  const who = user ? `${user.email} (${servicesOf(user.roles).editor ? "editor" : "no editor role"})` : "not signed in (sign_in_request / sign_in_verify)";
  console.error(`osct-mcp: ${config.api} as ${who}; token: ${config.tokenSource}; editor app: ${config.editor}`);
} catch (error) {
  console.error(`osct-mcp: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
