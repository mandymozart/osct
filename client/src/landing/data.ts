import { isLandingFile, LANDING_FILE } from "@shared/api/landing";
import { isContentManifest } from "@shared/types/content-manifest";
import { type LandingData, landingDataFromFile } from "@ui/landing/data";

/** Whether this app reads content of that schema (`MAJOR.MINOR`): a MAJOR between the oldest it reads and its own */
export const readableSchema = (schema: string, own: string, oldest: number): boolean => {
  const major = Number(/^(\d+)\.\d+$/.exec(schema)?.[1] ?? NaN);
  return major >= oldest && major <= Number(own.split(".")[0]);
};

/**
 * `readableSchema` against this app's content schema – the contract's module is loaded only here (the hero needs it
 * anyway), so the page's first code stays small
 */
const readableHere = async (schema: string): Promise<boolean> => {
  const { CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR } = await import("@shared/types/game-config");
  return readableSchema(schema, CONTENT_SCHEMA_VERSION, OLDEST_READABLE_SCHEMA_MAJOR);
};

export interface LoadLandingOptions {
  /** The experience's content base URL (`<environment base>/<experience>`); "" = the content bundled with the app */
  baseUrl: string;
  /**
   * The bundled content's `landing.json` (the content build writes it beside the bundled configuration – `null` without
   * one), read when there is no base URL; its content paths are the app's own
   */
  bundled?: () => Promise<unknown>;
  /**
   * The fallback without a readable `landing.json`: derives the data from the game configuration (`derive.ts`, loaded
   * only then); `fetch` answers the latest.json already read from memory
   */
  derive: (fetch: typeof globalThis.fetch) => Promise<LandingData>;
  fetch?: typeof globalThis.fetch;
}

/**
 * The landing's data: the current content version's `landing.json` (`<base>/latest.json` names the version) – or the
 * bundled content's (`bundled`) – when it is there and readable, else `derive`. A missing or broken file is no error –
 * every version published before publish wrote one has none.
 */
export const loadLandingData = async ({ baseUrl, bundled, derive, fetch: fetchFn = globalThis.fetch.bind(globalThis) }: LoadLandingOptions): Promise<LandingData> => {
  const base = baseUrl.replace(/\/+$/, "");
  let latest: unknown = null;
  if (!base && bundled) {
    const file = await bundled().catch(() => null);
    if (isLandingFile(file) && await readableHere(file.schema)) return landingDataFromFile(file, path => path);
  }
  if (base) {
    try {
      const response = await fetchFn(`${base}/latest.json?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-cache" });
      latest = response.ok ? await response.json() : null;
      if (isContentManifest(latest)) {
        const versionUrl = `${base}/${latest.build}`;
        const file = await fetchFn(`${versionUrl}/${LANDING_FILE}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
        if (isLandingFile(file) && await readableHere(file.schema)) return landingDataFromFile(file, path => `${versionUrl}${path}`);
        if (file !== null) console.warn(`[landing] ${versionUrl}/${LANDING_FILE} is not readable here – derived from the game configuration`);
      }
    } catch (error) {
      console.warn("[landing] landing.json not loaded:", error);
    }
  }
  // The game configuration's loader asks for latest.json again: answered with the one just read
  const known = isContentManifest(latest) ? JSON.stringify(latest) : null;
  const reuse: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return known && url.startsWith(`${base}/latest.json`)
      ? Promise.resolve(new Response(known, { status: 200, headers: { "Content-Type": "application/json" } }))
      : fetchFn(input, init);
  };
  return derive(reuse);
};
