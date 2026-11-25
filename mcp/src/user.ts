// The OSCT MCP server for one user: their roles pick the service – the editor's tools for the role `editor` – and only
// that service's tools, prompts and rules are listed. The API stays the only authority: every call carries the user's
// token. With `OSCT_EDITOR_TOKEN` – an AI connection's token `osct_…` made on the editor's experiences page, or a session
// token – the mail sign-in is skipped and whoami names the token. Without a token the server starts with `whoami` and
// the sign-in pair; a sign-in with the editor role then opens the tools (the client is told the list changed).
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { OsctApi } from "./api.ts";
import { registerCodeTools } from "./code.ts";
import type { Config } from "./config.ts";
import { registerContentTools } from "./content.ts";
import { registerDeliveryTools } from "./deliveries.ts";
import { instructions, registerPrompts } from "./prompts.ts";
import { registerRenderTool } from "./render-tool.ts";
import { registerResources } from "./resources.ts";
import { fail, failure, text } from "./result.ts";
import { appLinks, fetchUser, servicesOf, type Services, type User } from "./services.ts";
import { Versions } from "./update.ts";

/** = mcp/package.json version (RULES #10: one version with the app) */
export const VERSION = "6.23.3";

/**
 * `versions` compares this server with its instance (#367): `main` checks it before, so an outdated server says so in
 * its instructions; every call that fails like an outdated client's carries the next step (OsctApi.staleCheck).
 */
export function createUserServer(config: Config, api: OsctApi, user: User | null, versions: Versions = new Versions(api, VERSION)): McpServer {
  let services: Services | null = user ? servicesOf(user.roles) : null;
  api.staleCheck = async () => {
    const status = await versions.describe();
    return status.outdated || status.updatedTo ? { ...status } : null;
  };
  const stale = versions.last?.outdated
    ? `\nThis MCP server (${versions.current}) is older than its instance (${versions.last.instance}) – ${versions.self.kind === "bundle" ? "call update_server first" : "the checkout needs a git pull"}, then the person reconnects it.`
    : "";
  // every capability is declared now: a sign-in later registers the editor's tools, prompts and rules on a connected server
  const server = new McpServer(
    { name: "osct", version: VERSION },
    { instructions: instructions(services, config.api, config.local) + stale, capabilities: { tools: { listChanged: true }, prompts: { listChanged: true }, resources: { listChanged: true } } },
  );
  const links = appLinks(config);
  let opened = false;

  /** the editor's tools, prompts and rules – once, when the role is there */
  const openEditor = () => {
    if (opened || !services?.editor) return;
    opened = true;
    registerContentTools(server, api, links);
    registerCodeTools(server, api, links);
    registerDeliveryTools(server, api, links);
    registerRenderTool(server, api, config, links);
    registerPrompts(server, services);
    registerResources(server);
  };

  server.registerTool(
    "whoami",
    {
      description:
        "Who you work for (email, roles), how this server is signed in (an AI connection's token with its name, a session, or not yet), whether the editor's tools are open, the API and the editor app whose links every result hands back. Call it first.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        if (api.hasToken) {
          user = await fetchUser(api);
          services = user ? servicesOf(user.roles) : null;
          openEditor();
        }
      } catch (error) {
        return failure(error);
      }
      const signedIn = user?.token
        ? { with: "token", token: user.token, limits: "This token saves drafts as its person and never publishes, manages tokens or changes the account (403 not-for-ai)." }
        : user
          ? { with: "session" }
          : null;
      return text({
        user: user ? { email: user.email, roles: user.roles, language: user.language } : null,
        signedIn,
        services: services ?? { editor: false, admin: false },
        api: config.local ? `${config.api} (local dev)` : config.api,
        editor: links.editor,
        version: await versions.describe(),
        ...(user
          ? services?.editor
            ? { confirm: "Saves change the experience's draft. Give the person the link from each result: they check it on the stage and publish to readers in the editor." }
            : { hint: "No editor role – an admin grants it on the admin page (/editor/admin); this server lists the editor's tools once the role is there." }
          : { hint: "Not signed in: start the server with OSCT_EDITOR_TOKEN set to a token made on the editor's experiences page (AI connections) – or sign_in_request { email } (the code arrives by mail), then sign_in_verify { requestId, code }." }),
      });
    },
  );

  server.registerTool(
    "update_server",
    {
      description:
        "Updates this MCP server to its instance's version (#367): when whoami's `version.outdated` is true, or a call's error says so, it downloads the server file the instance serves (/mcp/osct-mcp.mjs) and replaces its own file – then the person reconnects the server (the client loads tools at start). A server run from a checkout is never replaced: it says to git pull. `force` fetches the file even when the versions match (a damaged file).",
      inputSchema: z.object({ force: z.boolean().optional().describe("replace even when the versions match – only when the person asks for it") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ force }) => {
      const result = await versions.update(force ?? false);
      return result.failed ? fail(result) : text(result);
    },
  );

  server.registerTool(
    "sign_in_request",
    {
      description: "Starts a sign-in by e-mail, for people without a token: the API mails a 6-digit code to the address (locally with MAIL_TRANSPORT=log it lands in the mail log). Ask the person for the code, then sign_in_verify. Not needed when OSCT_EDITOR_TOKEN is set (a token made on the editor's experiences page, AI connections).",
      inputSchema: z.object({ email: z.string().email() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ email }) => {
      try {
        const result = await api.call<{ requestId: string; expiresAt: string }>("POST", "/auth/request", { email, language: "en" });
        return text({ ...result, next: "Ask the person for the code from the mail, then sign_in_verify { requestId, code }." });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "sign_in_verify",
    {
      description: "Finishes the sign-in with the code from the mail: the session token is kept for this process (never shown). With the role editor the editor's tools open.",
      inputSchema: z.object({ requestId: z.string(), code: z.string().describe("the 6-digit code") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ requestId, code }) => {
      try {
        const result = await api.call<{ session: string; user: { email: string; roles?: string[]; language?: string } }>("POST", "/auth/verify", { requestId, code: code.replace(/\s+/g, "") });
        api.setToken(result.session);
        user = { email: result.user.email, roles: result.user.roles ?? [], language: result.user.language ?? "en", token: null };
        services = servicesOf(user.roles);
        const before = opened;
        openEditor();
        if (opened && !before) {
          server.sendToolListChanged();
          server.sendPromptListChanged();
          server.sendResourceListChanged();
        }
        if (!services.editor) return fail({ error: { code: "forbidden", message: `${user.email} is signed in but has no editor role – an admin grants it on the admin page.`, roles: user.roles } });
        return text({ user: { email: user.email, roles: user.roles }, services, opened: !before ? "the editor's tools are listed now" : "already open" });
      } catch (error) {
        return failure(error);
      }
    },
  );

  openEditor();
  return server;
}
