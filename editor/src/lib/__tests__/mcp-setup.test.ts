import { describe, expect, it } from "vitest";
import { ago, apiUrlFor, claudeCodeCommand, claudeDesktopConfig, day, expiresSoon, snippetFor, TOKEN_PLACEHOLDER } from "../mcp-setup";

describe("the MCP guide's setup (#142)", () => {
  it("names this instance's API as an absolute URL", () => {
    expect(apiUrlFor("/api", "https://osct.porschuetz.de")).toBe("https://osct.porschuetz.de/api");
    expect(apiUrlFor("/api/", "http://127.0.0.1:5185/")).toBe("http://127.0.0.1:5185/api");
    expect(apiUrlFor("https://api.example/api", "https://osct.example")).toBe("https://api.example/api");
  });

  it("fills a token just made into the Claude Code command, else the placeholder", () => {
    const api = "https://osct.porschuetz.de/api";
    expect(claudeCodeCommand(api, "osct_abc")).toBe(
      "claude mcp add osct --scope user -e OSCT_API_URL=https://osct.porschuetz.de/api -e OSCT_EDITOR_TOKEN=osct_abc -- node <path to osct>/mcp/bin/osct-mcp.mjs",
    );
    expect(claudeCodeCommand(api, null)).toContain(`OSCT_EDITOR_TOKEN=${TOKEN_PLACEHOLDER}`);
    expect(snippetFor("code", api, null)).toBe(claudeCodeCommand(api, null));
  });

  it("writes Claude Desktop's entry with the token in its env", () => {
    const config = JSON.parse(claudeDesktopConfig("https://x.example/api", "osct_abc"));
    expect(config).toEqual({ mcpServers: { osct: { command: "node", args: ["<path to osct>/mcp/bin/osct-mcp.mjs"], env: { OSCT_API_URL: "https://x.example/api", OSCT_EDITOR_TOKEN: "osct_abc" } } } });
    expect(JSON.parse(snippetFor("desktop", "https://x.example/api", null)).mcpServers.osct.env.OSCT_EDITOR_TOKEN).toBe(TOKEN_PLACEHOLDER);
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
