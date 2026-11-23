import { describe, expect, it } from "vitest";
import type { ApiError } from "../src/api.ts";
import { failure } from "../src/result.ts";
import { bannerVersion, compareVersions, Versions } from "../src/update.ts";
import { fakeFetch, type Route } from "./helpers.ts";

// The server against its instance's version, and update_server replacing its own file (#367)
const BUNDLE = { kind: "bundle" as const, path: "/home/me/osct-mcp.mjs" };
const CHECKOUT = { kind: "checkout" as const, path: "/src/osct/mcp/dist/osct-mcp.mjs" };
const file = (version: string) => `#!/usr/bin/env node\n// OSCT MCP server ${version} – one file, Node 22 (https://github.com/mandymozart/osct, mcp/)\nconsole.log(1);\n`;

/** An instance at `version`: GET /health, and the file it serves at /mcp/osct-mcp.mjs */
function instance(version: string | null, served = version ? file(version) : "") {
  const route: Route = ({ path }) => {
    if (path === "/health") return version ? { json: { status: "ok", version, env: "staging", db: "ok" } } : { status: 500, json: {} };
    if (path === "/editor/experiences") return { status: 422, json: { error: { code: "invalid-body", message: "Unknown field." } } };
    return undefined;
  };
  const fake = fakeFetch(route, "https://osct.example/api");
  const downloads: string[] = [];
  const download: typeof fetch = async input => {
    downloads.push(String(input));
    return new Response(served, { status: served ? 200 : 404 });
  };
  const written: { path: string; source: string }[] = [];
  const write = (path: string, source: string) => void written.push({ path, source });
  return { api: fake.api("tok"), seen: fake.seen, download, downloads, write, written };
}

describe("versions", () => {
  it("compares X.Y.Z numerically and reads the bundle's banner", () => {
    expect(compareVersions("6.9.0", "6.10.0")).toBe(-1);
    expect(compareVersions("6.18.0", "6.18.0")).toBe(0);
    expect(compareVersions("7.0.0", "6.99.99")).toBe(1);
    expect(compareVersions("dev", "6.0.0")).toBe(0);
    expect(bannerVersion(file("6.19.0"))).toBe("6.19.0");
    expect(bannerVersion(file("6.19.0").replace(/\n/g, "\r\n"))).toBe("6.19.0");
    expect(bannerVersion("<!doctype html><title>Not found</title>")).toBeNull();
  });

  it("an older server is outdated; the check is kept for a minute", async () => {
    const i = instance("6.19.0");
    let now = 0;
    const versions = new Versions(i.api, "6.18.0", BUNDLE, i.download, i.write, () => now);
    expect(await versions.check()).toEqual({ mcp: "6.18.0", instance: "6.19.0", outdated: true });
    now = 30_000;
    await versions.check();
    expect(i.seen.filter(s => s.path === "/health")).toHaveLength(1);
    now = 61_000;
    await versions.check();
    expect(i.seen.filter(s => s.path === "/health")).toHaveLength(2);
    expect((await versions.describe()).next).toContain("call update_server");
  });

  it("the same, a newer or an unreadable instance is not outdated", async () => {
    for (const [version, expected] of [["6.18.0", false], ["6.17.0", false], [null, false]] as const) {
      const i = instance(version);
      expect((await new Versions(i.api, "6.18.0", BUNDLE, i.download, i.write).check()).outdated).toBe(expected);
    }
  });
});

describe("update_server", () => {
  it("downloads the instance's file and writes it over its own; then it says to reconnect", async () => {
    const i = instance("6.19.0");
    const versions = new Versions(i.api, "6.18.0", BUNDLE, i.download, i.write);
    const result = await versions.update();
    expect(result).toMatchObject({ updated: true, from: "6.18.0", to: "6.19.0", file: BUNDLE.path });
    expect(result.next).toContain("Reconnect");
    expect(i.downloads).toEqual(["https://osct.example/mcp/osct-mcp.mjs"]);
    expect(i.written).toEqual([{ path: BUNDLE.path, source: file("6.19.0") }]);
    // the process still runs the old code: whoami says the new file waits for a reconnect, a second update does nothing
    const status = await versions.describe();
    expect(status).toMatchObject({ outdated: false, updatedTo: "6.19.0" });
    expect(status.next).toContain("reconnects");
    expect((await versions.update()).updated).toBe(false);
    expect(i.written).toHaveLength(1);
  });

  it("an up-to-date server downloads nothing – unless forced", async () => {
    const i = instance("6.18.0");
    const versions = new Versions(i.api, "6.18.0", BUNDLE, i.download, i.write);
    expect(await versions.update()).toMatchObject({ updated: false, message: expect.stringContaining("Up to date") });
    expect(i.downloads).toHaveLength(0);
    expect(await versions.update(true)).toMatchObject({ updated: true, to: "6.18.0" });
  });

  it("refuses a file that is not the OSCT MCP server, and a missing one", async () => {
    const html = instance("6.19.0", "<!doctype html><title>Editor</title>");
    expect(await new Versions(html.api, "6.18.0", BUNDLE, html.download, html.write).update()).toMatchObject({ updated: false, failed: true, message: expect.stringContaining("not the OSCT MCP server") });
    expect(html.written).toHaveLength(0);
    const missing = instance("6.19.0", "");
    expect(await new Versions(missing.api, "6.18.0", BUNDLE, missing.download, missing.write).update()).toMatchObject({ failed: true, message: expect.stringContaining("answered 404") });
  });

  it("a write that fails says to download the file by hand", async () => {
    const i = instance("6.19.0");
    const versions = new Versions(i.api, "6.18.0", BUNDLE, i.download, () => {
      throw new Error("EPERM");
    });
    expect(await versions.update()).toMatchObject({ updated: false, failed: true, message: expect.stringContaining("downloads https://osct.example/mcp/osct-mcp.mjs over it by hand") });
  });

  it("a checkout is never replaced – it is pulled", async () => {
    const i = instance("6.19.0");
    const versions = new Versions(i.api, "6.18.0", CHECKOUT, i.download, i.write);
    const result = await versions.update(true);
    expect(result).toMatchObject({ updated: false, next: expect.stringContaining("git pull") });
    expect(result.failed).toBeUndefined();
    expect(i.downloads).toHaveLength(0);
    expect((await versions.describe()).next).toContain("git pull");
  });
});

describe("a call that fails like an outdated client's", () => {
  it("carries the version status and the hint to update first", async () => {
    const i = instance("6.19.0");
    const versions = new Versions(i.api, "6.18.0", BUNDLE, i.download, i.write);
    i.api.staleCheck = async () => {
      const status = await versions.describe();
      return status.outdated ? { ...status } : null;
    };
    const error = (await i.api.call("GET", "/editor/experiences").catch((e: unknown) => e)) as ApiError;
    expect(error.details.outdated).toMatchObject({ mcp: "6.18.0", instance: "6.19.0", outdated: true });
    const shown = JSON.parse(failure(error).content[0].text);
    expect(shown.error.code).toBe("invalid-body");
    expect(shown.error.hint).toMatch(/^This server is older than its instance – call update_server/);
  });

  it("an up-to-date server's errors stay as they are", async () => {
    const i = instance("6.18.0");
    const versions = new Versions(i.api, "6.18.0", BUNDLE, i.download, i.write);
    i.api.staleCheck = async () => ((await versions.check()).outdated ? {} : null);
    const error = (await i.api.call("GET", "/editor/experiences").catch((e: unknown) => e)) as ApiError;
    expect(error.details.outdated).toBeUndefined();
  });
});
