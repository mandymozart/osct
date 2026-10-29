import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/types";
import { CONTENT_SCHEMA_VERSION, parseContentSchema } from "@shared/types/game-config";
import { compressedUrl } from "@/utils/compressed";
import {
  checkContentCompatibility,
  contentPathOf,
  contentUrl,
  getAssets,
  getConfigurationError,
  getContentBaseUrl,
  getContentSizes,
  getEntries,
  getSpreads,
  getTargets,
  isContentUrl,
  loadGameConfiguration,
} from "@/utils/game-config";

/** The bundled configuration as data (read, not imported: only utils/game-config.ts imports it – RULES #14) */
const bundled = JSON.parse(readFileSync(resolve(__dirname, "../../game.config.json"), "utf8")) as {
  version: { version: string; hash: string; schema: string };
  spreads: unknown[];
};

/**
 * Loading the game configuration from a content base URL (the CDN): latest.json names the current version, its
 * immutable folder holds game.config.json, files.json and the content files; content paths become URLs of that
 * folder. Also the startup compatibility check (content schema MAJOR only) and load failures.
 */

const BASE = "https://cdn.test/staging";
const BUILD = "0123456789ab";
const VERSION = `${BASE}/${BUILD}`;
const manifest = { build: BUILD, hash: "x", schema: CONTENT_SCHEMA_VERSION, version: "1.7.2", activatedAt: "2026-10-28T00:00:00.000Z" };
const app = parseContentSchema(CONTENT_SCHEMA_VERSION)!;
const schema = (major: number, minor: number) => `${major}.${minor}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch answering the environment's files (query strings ignored, like the CDN) */
const cdn = (files: Record<string, unknown>) =>
  vi.fn(async (url: string | URL | Request) => {
    const key = String(url).split("?")[0];
    return key in files ? json(files[key]) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

const withSchema = (value: string) => ({ ...bundled, version: { ...bundled.version, schema: value } });

describe("loading the game configuration from a content base URL", () => {
  // Every test file starts with the bundled configuration (test setup); put it back for the next tests
  afterEach(async () => {
    await loadGameConfiguration();
  });

  it("follows latest.json to the version folder and turns content paths into its URLs", async () => {
    const imagePath = getTargets(getSpreads()[0].id)[0].imageSrc as string;
    const fetch = cdn({
      [`${BASE}/latest.json`]: manifest,
      [`${VERSION}/game.config.json`]: bundled,
      [`${VERSION}/files.json`]: { [imagePath]: { size: 1234, v: "0123456789ab" } },
    });
    expect(await loadGameConfiguration({ baseUrl: `${BASE}/`, fetch })).toBeNull();
    expect(getConfigurationError()).toBeNull();
    expect(getContentBaseUrl()).toBe(VERSION);

    const spreads = getSpreads();
    expect(spreads.length).toBe(bundled.spreads.length);
    const imageSrc = getTargets(spreads[0].id)[0].imageSrc;
    expect(imageSrc).toBe(`${VERSION}${imagePath}`);
    expect(getAssets().every(a => a.src.startsWith(`${VERSION}/assets/content/`))).toBe(true);
    expect(getEntries().flatMap(e => (e.image ? [e.image] : [])).every(src => src.startsWith(`${VERSION}/assets/content/`))).toBe(true);
    expect(isContentUrl(imageSrc)).toBe(true);
    expect(isContentUrl("https://example.org/page")).toBe(false);
    expect(contentPathOf(imageSrc)).toBe(imagePath);
    expect(getContentSizes()).toEqual({ [imageSrc]: 1234 });

    // latest.json is the only file that changes: revalidated, with a value that changes every minute
    const requests = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = requests[0];
    expect(String(url)).toMatch(new RegExp(`^${BASE}/latest\\.json\\?t=\\d+$`));
    expect((init as RequestInit).cache).toBe("no-cache");
    // The version folder is immutable: plain requests
    expect(requests.slice(1).map(([u]) => String(u)).sort()).toEqual([`${VERSION}/files.json`, `${VERSION}/game.config.json`]);
  });

  it("loads the .gz copy of a CDN model from the same version folder", async () => {
    const model = "/assets/content/entities/x/model.glb";
    await loadGameConfiguration({ baseUrl: BASE, fetch: cdn({ [`${BASE}/latest.json`]: manifest, [`${VERSION}/game.config.json`]: bundled }) });
    vi.stubGlobal("DecompressionStream", class {});
    expect(compressedUrl(contentUrl(model))).toBe(`${VERSION}${model}.gz`);
    vi.unstubAllGlobals();
  });

  it("loads without files.json", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = cdn({ [`${BASE}/latest.json`]: manifest, [`${VERSION}/game.config.json`]: bundled });
    expect(await loadGameConfiguration({ baseUrl: BASE, fetch })).toBeNull();
    expect(getContentSizes()).toEqual({});
    vi.restoreAllMocks();
  });

  it("keeps the bundled configuration's paths when no base URL is set", async () => {
    await loadGameConfiguration({ baseUrl: "" });
    expect(getContentBaseUrl()).toBe("");
    expect(getContentSizes()).toBeNull();
    const imageSrc = getTargets(getSpreads()[0].id)[0].imageSrc;
    expect(imageSrc).toMatch(/^\/assets\/content\//);
    expect(isContentUrl(imageSrc)).toBe(true);
    expect(contentUrl(imageSrc)).toBe(imageSrc);
  });

  it("fails with a critical error when the configuration cannot be loaded or is invalid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = await loadGameConfiguration({ baseUrl: BASE, fetch: cdn({}) });
    expect(missing).toMatchObject({ code: ErrorCode.NETWORK_ERROR, type: "critical" });
    expect(getSpreads()).toEqual([]);

    const bogus = await loadGameConfiguration({ baseUrl: BASE, fetch: cdn({ [`${BASE}/latest.json`]: { build: "../x" } }) });
    expect(bogus).toMatchObject({ code: ErrorCode.NETWORK_ERROR, type: "critical" });

    const gone = await loadGameConfiguration({ baseUrl: BASE, fetch: cdn({ [`${BASE}/latest.json`]: manifest }) });
    expect(gone).toMatchObject({ code: ErrorCode.NETWORK_ERROR, type: "critical" });

    const broken = await loadGameConfiguration({
      baseUrl: BASE,
      fetch: cdn({ [`${BASE}/latest.json`]: manifest, [`${VERSION}/game.config.json`]: { version: {} } }),
    });
    expect(broken).toMatchObject({ code: ErrorCode.GAME_CONFIGURATION_INVALID, type: "critical" });
    vi.restoreAllMocks();
  });
});

// RULES #10 – the content schema MAJOR.MINOR is the only compatibility rule; the app version is information
describe("content compatibility", () => {
  const check = (value: string, version = bundled.version.version) =>
    checkContentCompatibility({ version, timestamp: "", schema: value });

  it("loads any MINOR of the app's MAJOR, newer or older", () => {
    expect(check(schema(app.major, app.minor))).toBeNull();
    expect(check(schema(app.major, app.minor + 3))).toBeNull();
    vi.spyOn(console, "info").mockImplementation(() => {});
    if (app.minor > 0) expect(check(schema(app.major, app.minor - 1))).toBeNull();
    vi.restoreAllMocks();
  });

  it("refuses another MAJOR: newer content asks for an app update", () => {
    expect(check(schema(app.major + 1, 0))).toMatchObject({ code: ErrorCode.NOT_SUPPORTED, type: "critical" });
    expect(check(schema(app.major + 1, 0))?.details?.[0]).toMatch(/update the app/);
    // Schema 1.x content is a 2.0 tree of one node per entity: read as it is; anything older is refused
    expect(check(schema(1, 9))).toBeNull();
    expect(check(schema(0, 9))?.details?.[0]).toMatch(/newer build/);
  });

  it("ignores the app version the content was built with", () => {
    expect(check(CONTENT_SCHEMA_VERSION, "0.1.0")).toBeNull();
    expect(check(CONTENT_SCHEMA_VERSION, "99.0.0")).toBeNull();
  });

  it("refuses content of a newer MAJOR at startup and loads a newer MINOR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const newer = await loadGameConfiguration({
      baseUrl: BASE,
      fetch: cdn({ [`${BASE}/latest.json`]: manifest, [`${VERSION}/game.config.json`]: withSchema(schema(app.major + 1, 0)) }),
    });
    expect(newer).toMatchObject({ code: ErrorCode.NOT_SUPPORTED, type: "critical" });
    expect(newer?.msg).not.toBe("");
    expect(getSpreads()).toEqual([]);

    const minor = await loadGameConfiguration({
      baseUrl: BASE,
      fetch: cdn({ [`${BASE}/latest.json`]: manifest, [`${VERSION}/game.config.json`]: withSchema(schema(app.major, app.minor + 1)) }),
    });
    expect(minor).toBeNull();
    expect(getSpreads().length).toBe(bundled.spreads.length);
    vi.restoreAllMocks();
    await loadGameConfiguration();
  });
});
