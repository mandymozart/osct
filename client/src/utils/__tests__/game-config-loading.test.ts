import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/types";
import { CONTENT_SCHEMA_VERSION } from "@shared/types/game-config";
import {
  contentUrl,
  getAssets,
  getConfigurationError,
  getContentBundleUrl,
  getEntries,
  getSpreads,
  getTargets,
  isContentUrl,
  loadGameConfiguration,
} from "@/utils/game-config";

/** The bundled configuration as data (read, not imported: only utils/game-config.ts imports it – RULES #14) */
const bundled = JSON.parse(readFileSync(resolve(__dirname, "../../game.config.json"), "utf8")) as {
  version: { version: string; hash: string; schema?: number };
  spreads: unknown[];
};

/**
 * Loading the game configuration from a content base URL (the CDN): `latest.json` names the bundle, the
 * bundle's `game.config.json` is checked and its content paths become bundle URLs. Also the startup
 * compatibility check (a newer content schema is refused) and load failures.
 */

const BASE = "https://cdn.test/staging";
const BUILD = "1.9.0-0123456789ab";
const manifest = (overrides: Partial<Record<string, unknown>> = {}) => ({
  build: BUILD,
  version: bundled.version.version,
  schema: CONTENT_SCHEMA_VERSION,
  hash: bundled.version.hash,
  uploadedAt: "2026-10-27T12:00:00.000Z",
  ...overrides,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch answering the manifest and the bundle's configuration */
const cdn = (files: Record<string, unknown>) =>
  vi.fn(async (url: string | URL | Request) => {
    const key = String(url);
    return key in files ? json(files[key]) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

describe("loading the game configuration from a content base URL", () => {
  // Every test file starts with the bundled configuration (test setup); put it back for the next tests
  afterEach(async () => {
    await loadGameConfiguration();
  });

  it("follows latest.json to the bundle and turns content paths into bundle URLs", async () => {
    const fetch = cdn({
      [`${BASE}/latest.json`]: manifest(),
      [`${BASE}/${BUILD}/game.config.json`]: bundled,
    });
    expect(await loadGameConfiguration({ baseUrl: `${BASE}/`, fetch })).toBeNull();
    expect(getConfigurationError()).toBeNull();
    expect(getContentBundleUrl()).toBe(`${BASE}/${BUILD}`);

    const spreads = getSpreads();
    expect(spreads.length).toBe(bundled.spreads.length);
    const imageSrc = getTargets(spreads[0].id)[0].imageSrc;
    expect(imageSrc).toMatch(new RegExp(`^${BASE}/${BUILD}/assets/content/`));
    expect(getAssets().every(a => a.src.startsWith(`${BASE}/${BUILD}/assets/content/`))).toBe(true);
    expect(getEntries().flatMap(e => (e.image ? [e.image] : [])).every(src => src.startsWith(`${BASE}/${BUILD}/assets/content/`))).toBe(true);
    expect(isContentUrl(imageSrc)).toBe(true);
    expect(isContentUrl("https://example.org/page")).toBe(false);
    expect(contentUrl("/assets/content/entries/x/y.jpg")).toBe(`${BASE}/${BUILD}/assets/content/entries/x/y.jpg`);

    const manifestRequest = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(manifestRequest[0]).toBe(`${BASE}/latest.json`);
    expect((manifestRequest[1] as RequestInit).cache).toBe("no-cache");
  });

  it("keeps the bundled configuration's paths when no base URL is set", async () => {
    await loadGameConfiguration({ baseUrl: "" });
    expect(getContentBundleUrl()).toBe("");
    const imageSrc = getTargets(getSpreads()[0].id)[0].imageSrc;
    expect(imageSrc).toMatch(/^\/assets\/content\//);
    expect(isContentUrl(imageSrc)).toBe(true);
    expect(contentUrl(imageSrc)).toBe(imageSrc);
  });

  it("refuses a bundle with a newer content schema (the app has to be updated)", async () => {
    const newer = { ...bundled, version: { ...bundled.version, schema: CONTENT_SCHEMA_VERSION + 1 } };
    const fetch = cdn({
      [`${BASE}/latest.json`]: manifest({ schema: CONTENT_SCHEMA_VERSION + 1 }),
      [`${BASE}/${BUILD}/game.config.json`]: newer,
    });
    const error = await loadGameConfiguration({ baseUrl: BASE, fetch });
    expect(error).toMatchObject({ code: ErrorCode.NOT_SUPPORTED, type: "critical" });
    expect(error?.msg).not.toBe("");
    expect(getConfigurationError()).toBe(error);
    expect(getSpreads()).toEqual([]);
  });

  it("reads a bundle without a schema as schema 1", async () => {
    const { schema: _schema, ...version } = bundled.version;
    const fetch = cdn({
      [`${BASE}/latest.json`]: manifest(),
      [`${BASE}/${BUILD}/game.config.json`]: { ...bundled, version },
    });
    expect(await loadGameConfiguration({ baseUrl: BASE, fetch })).toBeNull();
  });

  it("fails with a critical error when the manifest cannot be loaded or is not a manifest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = await loadGameConfiguration({ baseUrl: BASE, fetch: cdn({}) });
    expect(missing).toMatchObject({ code: ErrorCode.NETWORK_ERROR, type: "critical" });
    expect(getSpreads()).toEqual([]);

    const bogus = await loadGameConfiguration({ baseUrl: BASE, fetch: cdn({ [`${BASE}/latest.json`]: { hello: "world" } }) });
    expect(bogus).toMatchObject({ code: ErrorCode.NETWORK_ERROR, type: "critical" });

    const broken = await loadGameConfiguration({
      baseUrl: BASE,
      fetch: cdn({ [`${BASE}/latest.json`]: manifest(), [`${BASE}/${BUILD}/game.config.json`]: { version: {} } }),
    });
    expect(broken).toMatchObject({ code: ErrorCode.GAME_CONFIGURATION_INVALID, type: "critical" });
    vi.restoreAllMocks();
  });
});
