import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { activeExperience } from "@/utils/experience-path";
import { LANDING_SKIPPED_KEY, landingMode, readDeviceSignals } from "../desktop-visitor";
import { landingDecisionData, landingDecisionSource, renderEntryPreload, renderLandingDecision } from "../landing-decision-html";
import { LANDING_ATTRIBUTE } from "../landing-html";

/** The inline decision in index.html (#343, #355) says what desktop-visitor.ts `landingMode` says – on every path */
interface Device {
  queries: string[];
  platform?: string;
  maxTouchPoints?: number;
  userAgent?: string;
  standalone?: boolean;
}

const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/130";
const fakeWindow = (device: Device, pathname = "/osct/") => {
  const attributes = new Map<string, string>();
  return {
    win: {
      matchMedia: (query: string) => ({ matches: device.queries.includes(query) }),
      navigator: {
        platform: device.platform ?? "Win32", maxTouchPoints: device.maxTouchPoints ?? 0,
        userAgent: device.userAgent ?? WINDOWS_UA, ...(device.standalone ? { standalone: true } : {}),
      },
      location: { pathname },
      document: { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } },
    },
    attributes,
  };
};

const decide = (device: Device, skipped: boolean, pathname = "/osct/", fallback = "osct") => {
  const { win, attributes } = fakeWindow(device, pathname);
  const fn = new Function(`return ${landingDecisionSource(landingDecisionData(fallback))}`)() as (w: unknown, s: Pick<Storage, "getItem"> | null) => string | null;
  const mode = fn(win, { getItem: (key: string) => (key === LANDING_SKIPPED_KEY && skipped ? "1" : null) });
  return { mode, marked: attributes.get(LANDING_ATTRIBUTE) ?? null, win };
};

const WIDE = "(min-width: 56.25em)";
const DEVICES: Array<[string, Device]> = [
  ["a desktop browser, wide", { queries: [WIDE] }],
  ["a desktop browser, narrow", { queries: [] }],
  ["the installed app on a computer", { queries: [WIDE, "(display-mode: standalone)"] }],
  ["iOS home-screen app (navigator.standalone)", { queries: [WIDE], standalone: true }],
  ["a touch screen first", { queries: [WIDE, "(pointer: coarse)"] }],
  ["an Android phone", { queries: ["(pointer: coarse)"], userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile" }],
  ["an Android tablet, landscape", { queries: [WIDE, "(pointer: coarse)"], userAgent: "Mozilla/5.0 (Linux; Android 14)" }],
  ["an iPhone", { queries: [], userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }],
  ["an iPad posing as a Mac", { queries: [WIDE], platform: "MacIntel", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Macintosh)" }],
  ["a Mac", { queries: [WIDE], platform: "MacIntel", maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Macintosh)" }],
  ["a mobile user agent with a mouse", { queries: [WIDE], userAgent: "Mozilla/5.0 Mobi" }],
];

/** Every experience's path, not only the default's (#355): routes, other experiences, reserved paths, broken ones */
const PATHS: Array<[string, string]> = [
  ["/osct/", "osct"], ["/osct/scene/s1", "osct"], ["/osct/entry/e1", "osct"], ["/demo/", "osct"],
  ["/demo/about", "osct"], ["/Demo_2/about", "osct"], ["/", "osct"], ["/editor/", "osct"], ["/%E0%A4%A/", "osct"],
  ["/", ""], ["/demo/", ""], ["/OSCT/", "osct"], ["/scene/s1", "osct"], ["/privacy", "osct"],
];

const CASES = PATHS.flatMap(([path, fallback]) => [false, true].map(skipped => [path, fallback, skipped] as const));

describe("the inline landing decision", () => {
  describe.each(DEVICES)("%s", (_name, device) => {
    it.each(CASES)("on %s (default %s, skipped %s) decides as landingMode", (path, fallback, skipped) => {
      const { mode, marked, win } = decide(device, skipped, path, fallback);
      const want = landingMode(readDeviceSignals(win as unknown as Window), skipped, activeExperience(path, fallback || null), fallback || null);
      expect(mode).toBe(want);
      expect(marked).toBe(want);
    });
  });

  it("gives a computer the page on the default's path and placeholders on another experience's", () => {
    expect(decide({ queries: [WIDE] }, false, "/osct/scene/s1").mode).toBe("page");
    expect(decide({ queries: [WIDE] }, false, "/demo/").mode).toBe("skeleton");
    expect(decide({ queries: [WIDE] }, false, "/", "").mode).toBe("page");
    expect(decide({ queries: [WIDE] }, true, "/demo/").mode).toBeNull();
  });

  it("repeats desktop-visitor's constants", () => {
    const data = landingDecisionData(" osct ");
    expect(data.skipKey).toBe(LANDING_SKIPPED_KEY);
    expect(data.fallback).toBe("osct");
    expect(data.breakpoint).toBe(56.25);
  });

  it("is one script tag that never throws, also without storage", () => {
    const html = renderLandingDecision(landingDecisionData("osct"));
    expect(html.startsWith("<script>try {")).toBe(true);
    expect(html.endsWith("} catch (e) {}</script>")).toBe(true);
    const { win } = fakeWindow({ queries: [WIDE] });
    const fn = new Function(`return ${landingDecisionSource(landingDecisionData("osct"))}`)() as (w: unknown, s: null) => string | null;
    expect(fn(win, null)).toBe("page");
    vi.restoreAllMocks();
  });
});

describe("the entry loader (#355): the app or the landing, never both", () => {
  const indexHtml = readFileSync(resolve(import.meta.dirname, "../../../index.html"), "utf8");
  const loader = /<script type="module">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";

  const load = (landing: boolean): string[] => {
    const imported: string[] = [];
    const document = { documentElement: { hasAttribute: (name: string) => landing && name === LANDING_ATTRIBUTE } };
    new Function("document", "__import", loader.replace(/\bimport\(/g, "__import("))(document, (url: string) => imported.push(url));
    return imported;
  };

  it("index.html names no entry script of its own – only the loader module", () => {
    expect(indexHtml).not.toMatch(/<script type="module" src=/);
    expect(loader).toContain("/src/main.ts");
    expect(loader).toContain("/src/landing/entry.ts");
    expect(loader).toContain(`"${LANDING_ATTRIBUTE}"`);
  });

  it("loads the landing's entry on a computer and the app everywhere else", () => {
    expect(load(true)).toEqual(["/src/landing/entry.ts"]);
    expect(load(false)).toEqual(["/src/main.ts"]);
  });

  it("asks for the chosen entry's files at once, the other's never", () => {
    const html = renderEntryPreload(LANDING_ATTRIBUTE, { app: ["/assets/app/main-a.js", "/assets/app/three-b.js"], landing: ["/assets/app/entry-c.js"] });
    const script = html.slice("<script>".length, -"</script>".length);
    const run = (landing: boolean) => {
      const links: Array<{ rel: string; href: string }> = [];
      const document = {
        documentElement: { hasAttribute: (name: string) => landing && name === LANDING_ATTRIBUTE },
        createElement: () => ({ rel: "", href: "", crossOrigin: null }),
        head: { appendChild: (link: { rel: string; href: string }) => links.push(link) },
      };
      new Function("document", script)(document);
      return links.map(link => `${link.rel} ${link.href}`);
    };
    expect(run(false)).toEqual(["modulepreload /assets/app/main-a.js", "modulepreload /assets/app/three-b.js"]);
    expect(run(true)).toEqual(["modulepreload /assets/app/entry-c.js"]);
    expect(renderEntryPreload(LANDING_ATTRIBUTE, { app: [], landing: [] })).toBe("");
  });
});
