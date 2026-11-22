import { afterEach, describe, expect, it, vi } from "vitest";
import { activeExperience } from "@/utils/experience-path";
import { isDesktopVisitor, LANDING_SKIPPED_KEY, landingSkipped, readDeviceSignals } from "../desktop-visitor";
import { landingDecisionData, landingDecisionSource, renderLandingDecision } from "../landing-decision-html";
import { LANDING_ATTRIBUTE } from "../landing-html";

/** The inline decision in index.html (#343) says what desktop-visitor.ts says – on the default experience's path */
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
  const fn = new Function(`return ${landingDecisionSource(landingDecisionData(fallback))}`)() as (w: unknown, s: Pick<Storage, "getItem"> | null) => boolean;
  const shown = fn(win, { getItem: (key: string) => (key === LANDING_SKIPPED_KEY && skipped ? "1" : null) });
  return { shown, marked: attributes.has(LANDING_ATTRIBUTE), win };
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

describe("the inline landing decision", () => {
  afterEach(() => {
    sessionStorage.removeItem(LANDING_SKIPPED_KEY);
  });

  describe.each(DEVICES)("%s", (_name, device) => {
    it.each([false, true])("skipped: %s – decides as isDesktopVisitor && !landingSkipped", skipped => {
      const { shown, marked, win } = decide(device, skipped);
      if (skipped) sessionStorage.setItem(LANDING_SKIPPED_KEY, "1");
      const expected = isDesktopVisitor(readDeviceSignals(win as unknown as Window)) && !landingSkipped();
      expect(shown).toBe(expected);
      expect(marked).toBe(expected);
    });
  });

  const PATHS: Array<[string, string]> = [
    ["/osct/", "osct"], ["/osct/scene/s1", "osct"], ["/demo/", "osct"], ["/Demo_2/about", "osct"], ["/", "osct"],
    ["/editor/", "osct"], ["/%E0%A4%A/", "osct"], ["/", ""], ["/demo/", ""], ["/OSCT/", "osct"],
  ];

  it.each(PATHS)("on %s (default %s): only the default experience's path shows it", (path, fallback) => {
    const expected = activeExperience(path, fallback || null) === (fallback || null);
    expect(decide({ queries: [WIDE] }, false, path, fallback).shown).toBe(expected);
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
    const fn = new Function(`return ${landingDecisionSource(landingDecisionData("osct"))}`)() as (w: unknown, s: null) => boolean;
    expect(fn(win, null)).toBe(true);
    vi.restoreAllMocks();
  });
});
