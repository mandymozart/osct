import { describe, expect, it } from "vitest";
import {
  ago, apiUrlFor, CLIENTS, claudeCodeCommand, claudeDesktopConfig, codexConfig, commandLine, cursorConfig, day, envOf, expiresSoon,
  FILE_PLACEHOLDER, opencodeConfig, serverFileFrom, serverNameFor, shellArg, snippetFor, tokenNameFor, TOKEN_PLACEHOLDER, tomlString,
  type McpSetup,
} from "../mcp-setup";

const api = "https://osct.porschuetz.de/api";
const file = "/home/me/osct/mcp/bin/osct-mcp.mjs";
const setup: McpSetup = { name: "osct-staging", api, token: "osct_abc", file };
/** A Windows checkout with a space, and no token yet */
const windows: McpSetup = { name: "osct-production", api: "https://osct.buildingfictions.com/api", token: null, file: "C:\\Users\\Me Too\\osct\\mcp\\bin\\osct-mcp.mjs" };

describe("connecting an AI agent (#142, #194)", () => {
  it("names this instance's API as an absolute URL", () => {
    expect(apiUrlFor("/api", "https://osct.porschuetz.de")).toBe("https://osct.porschuetz.de/api");
    expect(apiUrlFor("/api/", "http://127.0.0.1:5185/")).toBe("http://127.0.0.1:5185/api");
    expect(apiUrlFor("https://api.example/api", "https://osct.example")).toBe("https://api.example/api");
  });

  it("names the server after the instance's environment, never the repository's own osct", () => {
    expect(serverNameFor("staging")).toBe("osct-staging");
    expect(serverNameFor("production")).toBe("osct-production");
    expect(serverNameFor("local", "127.0.0.1:5185")).toBe("osct-local");
    expect(serverNameFor(null, "osct.porschuetz.de")).toBe("osct-osct-porschuetz-de");
    expect(serverNameFor(undefined, "127.0.0.1:5185")).toBe("osct-127-0-0-1");
    expect(serverNameFor("  Stage 2! ")).toBe("osct-stage-2");
    expect(serverNameFor("", "")).toBe("osct-local");
    for (const env of ["local", "staging", "production", null]) expect(serverNameFor(env, "osct.example")).not.toBe("osct");
  });

  it("takes the server file as typed, or the checkout's folder", () => {
    expect(serverFileFrom("")).toBe("");
    expect(serverFileFrom("   ")).toBe("");
    expect(serverFileFrom(file)).toBe(file);
    expect(serverFileFrom(' "C:\\dev\\osct\\mcp\\bin\\osct-mcp.mjs" ')).toBe("C:\\dev\\osct\\mcp\\bin\\osct-mcp.mjs");
    expect(serverFileFrom("/home/me/osct/")).toBe(file);
    expect(serverFileFrom("C:\\dev\\osct")).toBe("C:\\dev\\osct\\mcp\\bin\\osct-mcp.mjs");
    expect(serverFileFrom("C:/dev/osct")).toBe("C:/dev/osct/mcp/bin/osct-mcp.mjs");
  });

  it("suggests a token name after the agent and the machine", () => {
    expect(tokenNameFor("codex")).toBe("Codex on my laptop");
    expect(tokenNameFor("claude-code")).toBe("Claude Code on my laptop");
  });

  it("gives every client the same environment: the API and the token or its placeholder", () => {
    expect(envOf(setup)).toEqual({ OSCT_API_URL: api, OSCT_EDITOR_TOKEN: "osct_abc" });
    expect(envOf(windows).OSCT_EDITOR_TOKEN).toBe(TOKEN_PLACEHOLDER);
  });

  it("quotes a shell argument only when it needs it", () => {
    expect(shellArg(file)).toBe(file);
    expect(shellArg("OSCT_EDITOR_TOKEN=osct_…")).toBe("OSCT_EDITOR_TOKEN=osct_…");
    expect(shellArg("C:\\Users\\Me Too\\x.mjs")).toBe("'C:\\Users\\Me Too\\x.mjs'");
    expect(shellArg("it's here")).toBe("'it'\\''s here'");
    expect(commandLine(setup)).toBe(`node ${file}`);
    expect(commandLine({ ...setup, file: "" })).toBe(`node ${FILE_PLACEHOLDER}`);
  });

  it("writes Claude Code's command, the name before the options", () => {
    expect(claudeCodeCommand(setup)).toBe(
      `claude mcp add osct-staging --scope user -e OSCT_API_URL=${api} -e OSCT_EDITOR_TOKEN=osct_abc -- node ${file}`,
    );
    expect(claudeCodeCommand(windows)).toBe(
      "claude mcp add osct-production --scope user -e OSCT_API_URL=https://osct.buildingfictions.com/api " +
        `-e OSCT_EDITOR_TOKEN=${TOKEN_PLACEHOLDER} -- node 'C:\\Users\\Me Too\\osct\\mcp\\bin\\osct-mcp.mjs'`,
    );
  });

  it("writes Claude Desktop's mcpServers entry", () => {
    expect(JSON.parse(claudeDesktopConfig(setup))).toEqual({
      mcpServers: { "osct-staging": { command: "node", args: [file], env: { OSCT_API_URL: api, OSCT_EDITOR_TOKEN: "osct_abc" } } },
    });
    expect(JSON.parse(claudeDesktopConfig(windows)).mcpServers["osct-production"].args).toEqual([windows.file]);
  });

  it("writes Codex's config.toml table with its env table", () => {
    expect(codexConfig(setup)).toBe([
      "[mcp_servers.osct-staging]",
      'command = "node"',
      `args = ["${file}"]`,
      "",
      "[mcp_servers.osct-staging.env]",
      `OSCT_API_URL = "${api}"`,
      'OSCT_EDITOR_TOKEN = "osct_abc"',
    ].join("\n"));
    expect(codexConfig(windows)).toContain('args = ["C:\\\\Users\\\\Me Too\\\\osct\\\\mcp\\\\bin\\\\osct-mcp.mjs"]');
    expect(codexConfig(windows)).toContain(`OSCT_EDITOR_TOKEN = "${TOKEN_PLACEHOLDER}"`);
    expect(codexConfig({ ...setup, name: "osct.x" })).toContain('[mcp_servers."osct.x"]');
    expect(tomlString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\u000ad"');
  });

  it("writes OpenCode's local server with the command as one array", () => {
    expect(JSON.parse(opencodeConfig(setup))).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: { "osct-staging": { type: "local", command: ["node", file], enabled: true, environment: { OSCT_API_URL: api, OSCT_EDITOR_TOKEN: "osct_abc" } } },
    });
    expect(JSON.parse(opencodeConfig(windows)).mcp["osct-production"].command).toEqual(["node", windows.file]);
  });

  it("writes Cursor's mcp.json entry as a stdio server", () => {
    expect(JSON.parse(cursorConfig(setup))).toEqual({
      mcpServers: { "osct-staging": { type: "stdio", command: "node", args: [file], env: { OSCT_API_URL: api, OSCT_EDITOR_TOKEN: "osct_abc" } } },
    });
    expect(JSON.parse(cursorConfig({ ...windows, file: "" })).mcpServers["osct-production"].args).toEqual([FILE_PLACEHOLDER]);
  });

  it("picks each client's snippet, every one with the name, the API, the token and the file", () => {
    for (const client of CLIENTS) {
      const text = snippetFor(client, setup);
      for (const part of ["osct-staging", api, "osct_abc", file]) expect(text, client).toContain(part);
      expect(snippetFor(client, { ...setup, token: null }), client).toContain(TOKEN_PLACEHOLDER);
      expect(snippetFor(client, { ...setup, file: "" }), client).toContain(FILE_PLACEHOLDER);
    }
    expect(snippetFor("codex", setup)).toBe(codexConfig(setup));
  });

  it("says when a token was last used and when it expires, in words", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    expect(ago(null, now)).toBe("never");
    expect(ago("2026-10-30T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-30T11:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-10-30T09:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-29T10:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-10-18T12:00:00Z", now)).toBe("12 days ago");
    expect(day("2027-04-30T10:00:00+00:00")).toBe("30 Apr 2027");
    expect(expiresSoon("2026-11-05T12:00:00Z", now)).toBe(true);
    expect(expiresSoon("2027-04-30T12:00:00Z", now)).toBe(false);
    expect(expiresSoon("2026-10-01T12:00:00Z", now)).toBe(false);
    expect(expiresSoon(null, now)).toBe(false);
  });
});
