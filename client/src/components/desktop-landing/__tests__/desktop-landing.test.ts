import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DesktopLanding, isDesktopVisitor, LANDING_CONFIG, LANDING_SKIPPED_KEY, readDeviceSignals } from "..";

const desktop = { standalone: false, coarsePointer: false, mobileAgent: false, wide: true };

describe("isDesktopVisitor", () => {
  it("is true for a computer: fine pointer, desktop browser, wide window", () => {
    expect(isDesktopVisitor(desktop)).toBe(true);
  });

  it("is false for phones and tablets, the installed app and narrow windows", () => {
    expect(isDesktopVisitor({ ...desktop, coarsePointer: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, mobileAgent: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, standalone: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, wide: false })).toBe(false);
  });
});

describe("readDeviceSignals", () => {
  const fakeWindow = (queries: string[], navigator: Partial<Navigator>) => ({
    matchMedia: (query: string) => ({ matches: queries.includes(query) }),
    navigator: { platform: "Win32", maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ...navigator },
  }) as unknown as Window;

  it("reads a desktop browser", () => {
    expect(readDeviceSignals(fakeWindow(["(min-width: 56.25em)"], {}))).toEqual(desktop);
  });

  it("knows an iPad posing as a Mac and an Android phone", () => {
    expect(readDeviceSignals(fakeWindow([], { platform: "MacIntel", maxTouchPoints: 5 })).mobileAgent).toBe(true);
    expect(readDeviceSignals(fakeWindow(["(pointer: coarse)"], { userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile" })))
      .toMatchObject({ coarsePointer: true, mobileAgent: true });
  });
});

describe("<desktop-landing>", () => {
  let landing: DesktopLanding;
  const mount = () => {
    landing = document.createElement("desktop-landing") as DesktopLanding;
    document.body.appendChild(landing);
  };
  const root = () => landing.shadowRoot!;

  beforeEach(() => sessionStorage.removeItem(LANDING_SKIPPED_KEY));
  afterEach(() => {
    landing?.remove();
    vi.unstubAllGlobals();
  });

  it("stays hidden and lets the app start at once on a phone (no desktop signals)", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" }));
    mount();
    expect(landing.hidden).toBe(true);
    await expect(landing.whenDone()).resolves.toBeUndefined();
  });

  describe("on a computer", () => {
    beforeEach(() => vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 56.25em)" })));

    it("shows what this is, the address for the phone, install, and the shop items with their links", () => {
      mount();
      expect(landing.hidden).toBe(false);
      const text = root().textContent ?? "";
      expect(text).toContain("Get the app");
      expect(root().querySelector(".address")!.textContent).toBe(location.host);
      expect(root().querySelector("settings-install")).not.toBeNull();
      const links = Array.from(root().querySelectorAll<HTMLAnchorElement>(".shop a"));
      expect(links.map(link => link.getAttribute("href"))).toEqual(LANDING_CONFIG.shop.map(item => item.url));
      expect(links.every(link => link.target === "_blank" && link.rel.includes("noopener"))).toBe(true);
      expect(root().querySelector<HTMLImageElement>(".phone img")!.getAttribute("src")).toBe(LANDING_CONFIG.previewImage);
    });

    it("\"Open the app here\" hides it, starts the app and is remembered for the tab", async () => {
      mount();
      let done = false;
      void landing.whenDone().then(() => (done = true));
      await Promise.resolve();
      expect(done).toBe(false);
      root().querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();
      await landing.whenDone();
      expect(landing.hidden).toBe(true);
      expect(sessionStorage.getItem(LANDING_SKIPPED_KEY)).toBe("1");

      landing.remove();
      mount();
      expect(landing.hidden).toBe(true);
    });
  });
});
