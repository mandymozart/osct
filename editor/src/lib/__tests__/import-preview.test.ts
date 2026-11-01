import { describe, expect, it } from "vitest";
import { ApiError, type ImportComparison, type ImportPreview } from "../api";
import { contentBaseOf, contentsLine, importLabel, lossLine, previewRows, readContentBase, replaceLine, shortBuild, SourceError, sourceErrorLine } from "../import-preview";

const existing = (over: Partial<ImportComparison["draft"]> = {}, same = false): ImportComparison => ({
  book: { id: "demo", title: "The Demo Book" },
  incoming: { book: "demo", title: "The Demo Book", build: "7457f0c10df1", hash: "7457f0c10df1".padEnd(64, "0"), date: "2026-10-30T06:58:51.396Z", appVersion: "1.41.0", schema: "2.17", source: "cdn", from: "https://cdn.example/demo/7457f0c10df1" },
  draft: {
    basedOn: { build: "abababababab", hash: "ab".repeat(32), date: "2026-10-01T08:00:00.000Z", appVersion: "1.30.0", schema: "2.17", source: "cdn", from: null, importedAt: "2026-10-02T09:00:00.000Z", importedBy: "author@example.com" },
    build: "0123456789ab",
    edits: 3,
    editsSince: "2026-10-02T09:00:00.000Z",
    recentEdits: [],
    live: [],
    ...over,
  },
  same,
});

const preview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
  source: "cdn",
  contentBase: "https://cdn.example/demo",
  manifest: { url: "https://cdn.example/demo/latest.json", build: "7457f0c10df1", activatedAt: "2026-10-30T06:59:06.687Z" },
  incoming: existing().incoming,
  counts: { spreads: 6, entries: 13, targets: 8, entities: 2 },
  existing: null,
  ...over,
});

/** A fetch that answers from a map of URL → JSON (a missing URL: 404) */
const fetcher = (files: Record<string, unknown>): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    return url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response("", { status: 404, statusText: "Not Found" });
  }) as typeof fetch;

// Before anything is imported, the form says what comes in: one book, which build, from where (#182)
describe("the import's preview", () => {
  it("the button names the one book and its build", () => {
    expect(importLabel(preview())).toBe("Import 1 book: The Demo Book (build 7457f0c…)");
    expect(importLabel(preview({ incoming: { ...existing().incoming, build: null } }))).toBe("Import 1 book: The Demo Book");
    expect(shortBuild("fb4c5621abcd")).toBe("fb4c562…");
  });

  it("lists where it comes from, the build, versions, the book and what it holds", () => {
    const rows = previewRows(preview(), "https://cdn.example/demo", "https://cdn.example/demo/7457f0c10df1");
    expect(rows.map(r => r.label)).toEqual(["From", "Build", "Built", "App version", "Schema", "Book", "Holds", "Assets at"]);
    expect(rows[0].value).toBe("https://cdn.example/demo");
    expect(rows[1].value).toBe("7457f0c10df1");
    expect(rows[2].value).toContain("current since");
    expect(rows[5].value).toBe("The Demo Book · demo");
    expect(rows[6].value).toBe("6 spreads · 13 entries · 8 targets · 2 shared entities");
    expect(previewRows(preview({ manifest: null }), null, null).map(r => r.label)).not.toContain("Assets at");
    expect(previewRows(preview({ manifest: null }), null, null)[2].value).not.toContain("current since");
  });

  it("counts in the singular and leaves out shared entities when there are none", () => {
    expect(contentsLine({ spreads: 1, entries: 1, targets: 0, entities: 0 })).toBe("1 spread · 1 entry · 0 targets");
  });

  it("a new book: nothing is replaced", () => {
    expect(replaceLine(preview())).toBeNull();
    expect(lossLine(preview())).toBeNull();
  });

  it("a draft of that id is here: it says the import replaces it and that its unpublished edits are lost", () => {
    const p = preview({ existing: existing() });
    expect(replaceLine(p)).toBe("A draft of “The Demo Book” (demo) is already here – importing replaces it.");
    expect(lossLine(p)).toBe("Its 3 unpublished edits since its import are lost.");
    expect(lossLine(preview({ existing: existing({ edits: 1 }) }))).toBe("Its 1 unpublished edit since its import is lost.");
  });

  it("edits the draft as it is now has live somewhere are not called unpublished; no edits lose nothing", () => {
    expect(lossLine(preview({ existing: existing({ live: [{ env: "staging", build: "0123456789ab", current: true }] }) }))).toBe("Its 3 edits since its import are lost.");
    expect(lossLine(preview({ existing: existing({ edits: 0 }) }))).toBe("It has no edits since its import – nothing of its own is lost.");
    expect(lossLine(preview({ existing: existing({ basedOn: null }) }))).toBe("Its 3 unpublished edits in its change log are lost.");
    expect(replaceLine(preview({ existing: existing({ edits: 0 }, true) }))).toBe("A draft of “The Demo Book” (demo) based on this build is already here – importing replaces it.");
  });
});

describe("reading a content base", () => {
  it("a URL without a .json file is a content base", () => {
    expect(contentBaseOf("https://cdn.example/demo/")).toBe("https://cdn.example/demo");
    expect(contentBaseOf("https://cdn.example/demo/7457f0c10df1/game.config.json")).toBeNull();
    expect(contentBaseOf("  ")).toBeNull();
  });

  it("latest.json names the build; its folder holds the configuration and is the assets base", async () => {
    const read = await readContentBase("https://cdn.example/demo", fetcher({
      "https://cdn.example/demo/latest.json": { build: "7457f0c10df1", activatedAt: "2026-10-30T06:59:06.687Z" },
      "https://cdn.example/demo/7457f0c10df1/game.config.json": { book: { id: "demo" } },
    }));
    expect(read.manifest).toEqual({ url: "https://cdn.example/demo/latest.json", build: "7457f0c10df1", activatedAt: "2026-10-30T06:59:06.687Z" });
    expect(read.versionFolder).toBe("https://cdn.example/demo/7457f0c10df1");
    expect(read.configuration).toEqual({ book: { id: "demo" } });
  });

  it("errors name the URL: no latest.json, no build in it, no configuration", async () => {
    await expect(readContentBase("https://cdn.example/none", fetcher({}))).rejects.toMatchObject({ url: "https://cdn.example/none/latest.json", message: "https://cdn.example/none/latest.json answered 404 Not Found." });
    await expect(readContentBase("https://cdn.example/demo", fetcher({ "https://cdn.example/demo/latest.json": { book: "demo" } }))).rejects.toMatchObject({ url: "https://cdn.example/demo/latest.json", message: "https://cdn.example/demo/latest.json names no build." });
    await expect(readContentBase("https://cdn.example/demo", fetcher({ "https://cdn.example/demo/latest.json": { build: "7457f0c10df1" } }))).rejects.toBeInstanceOf(SourceError);
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    await expect(readContentBase("https://cdn.example/demo", offline)).rejects.toMatchObject({ url: "https://cdn.example/demo/latest.json" });
  });

  it("an error line keeps the URL apart: the reader's own, and the API's content-fetch-failed", () => {
    expect(sourceErrorLine(new SourceError("x answered 404.", "x"))).toEqual({ message: "x answered 404.", url: "x" });
    const api = new ApiError(502, "content-fetch-failed", "https://cdn.example/demo/latest.json answered 404.", { url: "https://cdn.example/demo/latest.json" });
    expect(sourceErrorLine(api)).toEqual({ message: "https://cdn.example/demo/latest.json answered 404. (content-fetch-failed)", url: "https://cdn.example/demo/latest.json" });
    expect(sourceErrorLine(new ApiError(400, "no-content-base", "CONTENT_BASE_URL is not set on this server."))).toEqual({ message: "CONTENT_BASE_URL is not set on this server. (no-content-base)", url: null });
  });
});
