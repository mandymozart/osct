import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/config.ts";
import { VERSION } from "../src/user.ts";

// One version for app, content tooling, server and the MCP server (RULES #10); the source is client/package.json
describe("one version", () => {
  it("mcp/package.json and the server's VERSION carry the app's version", () => {
    const version = (file: string) => JSON.parse(readFileSync(resolve(ROOT, file), "utf8")).version as string;
    expect(version("mcp/package.json")).toBe(version("client/package.json"));
    expect(VERSION).toBe(version("client/package.json"));
  });
});
