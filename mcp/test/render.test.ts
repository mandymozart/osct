import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.ts";
import { countsForLoad, findBrowser, InFlight, pngName, renderUrl, requestAction, tokenScope, type RenderOptions } from "../src/render.ts";
import { registerRenderTool } from "../src/render-tool.ts";
import { fakeFetch, recorder } from "./helpers.ts";

describe("render_scene's pure parts (#89)", () => {
  it("finds the browser: OSCT_BROWSER, else the first installed Chrome or Edge", () => {
    const has = (...paths: string[]) => (path: string) => paths.includes(path);
    expect(findBrowser({ OSCT_BROWSER: "/opt/brave" }, "linux", has("/opt/brave"))).toBe("/opt/brave");
    expect(findBrowser({ OSCT_BROWSER: "/opt/missing" }, "linux", has("/usr/bin/chromium"))).toBeNull();
    expect(findBrowser({}, "linux", has("/usr/bin/chromium", "/usr/bin/microsoft-edge"))).toBe("/usr/bin/chromium");
    expect(findBrowser({}, "win32", has("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"))).toBe("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(findBrowser({}, "darwin", has())).toBeNull();
    expect(findBrowser({}, "plan9", has("/usr/bin/chromium"))).toBeNull();
  });

  it("opens the editor's render view, the ids encoded, no token in the URL", () => {
    expect(renderUrl("https://osct.porschuetz.de/editor", "osct", "s002-003", "top")).toBe("https://osct.porschuetz.de/editor/osct/s002-003/?render=top");
    expect(renderUrl("http://localhost:5175/editor", "a b", "c/d", "reader")).toBe("http://localhost:5175/editor/a%20b/c%2Fd/?render=reader");
  });

  it("sends the token to the instance's own API only", () => {
    expect(tokenScope("https://osct.porschuetz.de/api", "https://osct.porschuetz.de/editor")).toBe("https://osct.porschuetz.de/api/");
    // the local dev editor passes its /api to the local API
    expect(tokenScope("http://127.0.0.1:8080/api", "http://localhost:5175/editor")).toBe("http://localhost:5175/api/");
    expect(() => tokenScope("https://osct.porschuetz.de/api", "https://elsewhere.example/editor")).toThrow(/different hosts/);
    expect(() => tokenScope("https://osct.porschuetz.de/api", "http://localhost:5175/editor")).toThrow(/different hosts/);
  });

  it("adds the token to the API's reads, refuses its writes, leaves the rest alone", () => {
    const scope = "https://osct.porschuetz.de/api/";
    expect(requestAction("GET", "https://osct.porschuetz.de/api/editor/experiences/osct", scope)).toBe("token");
    expect(requestAction("HEAD", "https://osct.porschuetz.de/api/user", scope)).toBe("token");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(requestAction(method, "https://osct.porschuetz.de/api/editor/experiences/osct", scope)).toBe("block");
    expect(requestAction("GET", "https://buildingfictions.b-cdn.net/staging/x.glb", scope)).toBe("pass");
    expect(requestAction("GET", "https://osct.porschuetz.de/apiary", scope)).toBe("pass");
    expect(requestAction("POST", "https://osct.porschuetz.de/editor/x", scope)).toBe("pass");
  });

  it("waits for the requests that end, not for streams or documents", () => {
    expect(countsForLoad("Image")).toBe(true);
    expect(countsForLoad("Fetch")).toBe(true);
    expect(countsForLoad(undefined)).toBe(true);
    for (const type of ["Media", "WebSocket", "EventSource", "Document"]) expect(countsForLoad(type)).toBe(false);
  });

  it("counts the requests in flight and how long none has been", () => {
    const f = new InFlight(0);
    expect(f.quiet(999, 1000)).toBe(false);
    expect(f.quiet(1000, 1000)).toBe(true);
    f.start("a");
    f.start("b");
    expect(f.quiet(5000, 1000)).toBe(false);
    f.end("a", 5000);
    f.end("x", 5100); // unknown: ignored
    expect(f.count).toBe(1);
    f.end("b", 6000);
    expect(f.quiet(6500, 1000)).toBe(false);
    expect(f.quiet(7000, 1000)).toBe(true);
  });

  it("names the picture safely", () => {
    expect(pngName("osct", "s002-003", "reader", new Date("2026-11-20T02:37:03.880Z"))).toBe("osct-s002-003-reader-2026-11-20T02-37-03-880Z.png");
    expect(pngName("a/b", "c:d", "top", new Date(0))).toBe("a_b-c_d-top-1970-01-01T00-00-00-000Z.png");
  });
});

describe("render_scene (#89)", () => {
  const config: Config = { api: "http://api.test/api", editor: "http://api.test/editor", token: "tok", tokenSource: "env", local: false };
  const tree = { experience: { id: "osct" }, scenes: [{ id: "s1", entries: [] }], groups: [] };
  const setup = (token = "tok") => {
    const { api } = fakeFetch(seen => (seen.path === "/editor/experiences/osct" ? { json: tree } : undefined));
    const rec = recorder();
    const calls: RenderOptions[] = [];
    registerRenderTool(rec.server, api(token), config, { editor: config.editor }, async options => {
      calls.push(options);
      return { file: "/tmp/osct-renders/x.png", png: Buffer.from([0x89, 0x50, 0x4e, 0x47]), settled: true, blockedWrites: 0 };
    });
    const tool = rec.tools.get("render_scene")!;
    const run = async (args: Record<string, unknown>) => {
      const schema = tool.config.inputSchema as { parse: (value: unknown) => Record<string, unknown> };
      return (await tool.handler(schema.parse(args))) as unknown as { content: ({ type: string; text?: string; data?: string; mimeType?: string })[]; isError?: boolean };
    };
    return { run, calls };
  };

  it("answers the picture as an image and the file's path, the reader's view at 1280 × 800 by default", async () => {
    const { run, calls } = setup();
    const result = await run({ experience: "osct", scene: "s1" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "image", data: "iVBORw==", mimeType: "image/png" });
    const about = JSON.parse(result.content[1]!.text!);
    expect(about).toMatchObject({ file: "/tmp/osct-renders/x.png", scene: "s1", view: "reader", size: { width: 1280, height: 800 }, open: "http://api.test/editor/osct/s1/" });
    expect(calls[0]).toMatchObject({ authorization: "Bearer tok", editor: "http://api.test/editor", view: "reader", width: 1280, height: 800 });
    // the token travels to the browser only, never into the answer
    expect(JSON.stringify(result)).not.toContain("tok\"");
  });

  it("refuses an unknown scene before a browser starts, and works only signed in", async () => {
    const { run, calls } = setup();
    const missing = await run({ experience: "osct", scene: "s9" });
    expect(missing.isError).toBe(true);
    expect(JSON.parse(missing.content[0]!.text!).error).toMatchObject({ code: "not-found", scenes: ["s1"] });
    expect(calls).toHaveLength(0);
    const out = await setup("").run({ experience: "osct", scene: "s1" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("Not signed in");
  });

  it("checks the view and the size", async () => {
    const { run } = setup();
    await expect(run({ experience: "osct", scene: "s1", view: "sideways" })).rejects.toThrow();
    await expect(run({ experience: "osct", scene: "s1", width: 100 })).rejects.toThrow();
    await expect(run({ experience: "osct", scene: "s1", height: 5000 })).rejects.toThrow();
  });
});
