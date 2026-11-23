import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DesktopLanding, isDesktopVisitor, landingQrUrl, LANDING_CONFIG, LANDING_SKIPPED_KEY, readDeviceSignals } from "..";
import { LANDING_ATTRIBUTE, STATIC_LANDING_ID } from "../landing-html";

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

    it("shows what this is, the address for the phone (no install – #354), and the shop items with their links", () => {
      mount();
      expect(landing.hidden).toBe(false);
      const text = root().textContent ?? "";
      expect(text).toContain("Get the app");
      expect(root().querySelector(".address")!.textContent).toBe(location.host);
      expect(root().querySelector("settings-install")).toBeNull();
      const links = Array.from(root().querySelectorAll<HTMLAnchorElement>(".shop a"));
      expect(links.map(link => link.getAttribute("href"))).toEqual(LANDING_CONFIG.shop.map(item => item.url));
      expect(links.every(link => link.target === "_blank" && link.rel.includes("noopener"))).toBe(true);
      expect(root().querySelector(".stage")!.getAttribute("role")).toBe("img");
    });

    it("draws a QR code that opens the app with the landing page as its source (?s=lp1, #324)", async () => {
      const made: Array<{ text?: string }> = [];
      vi.stubGlobal("QRCode", Object.assign(function (this: unknown, el: HTMLElement, options: { text?: string }) {
        made.push(options);
        el.appendChild(document.createElement("img"));
      }, { CorrectLevel: { L: 1, M: 0, Q: 3, H: 2 } }));
      mount();
      await vi.waitFor(() => expect(made).toHaveLength(1));
      expect(made[0].text).toBe(`${location.origin}/?s=lp1`);
      expect(landingQrUrl("https://osct.buildingfictions.com", "")).toBe("https://osct.buildingfictions.com/?s=lp1");
      expect(landingQrUrl("https://osct.buildingfictions.com", "/osct")).toBe("https://osct.buildingfictions.com/osct/?s=lp1");
      expect(root().querySelector(".qr-code img")!.getAttribute("alt")).toBe("QR code that opens the app on your phone");
    });

    it("never lets a computer into the app – only the developers' sessionStorage key does (#354)", async () => {
      mount();
      let done = false;
      void landing.whenDone().then(() => (done = true));
      await Promise.resolve();
      expect(done).toBe(false);
      expect(root().querySelector('[data-action="continue"]')).toBeNull();

      landing.remove();
      sessionStorage.setItem(LANDING_SKIPPED_KEY, "1");
      mount();
      expect(landing.hidden).toBe(true);
      sessionStorage.removeItem(LANDING_SKIPPED_KEY);
    });
  });
  describe("taking over from the static landing in index.html (#343)", () => {
    const staticLanding = () => {
      const element = document.createElement("div");
      element.id = STATIC_LANDING_ID;
      document.body.appendChild(element);
      document.documentElement.setAttribute(LANDING_ATTRIBUTE, "");
      return element;
    };
    afterEach(() => {
      document.getElementById(STATIC_LANDING_ID)?.remove();
      document.documentElement.removeAttribute(LANDING_ATTRIBUTE);
    });

    it("on a computer: renders underneath, then removes the static page", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 56.25em)" }));
      const element = staticLanding();
      mount();
      expect(landing.hidden).toBe(false);
      await vi.waitFor(() => expect(element.isConnected).toBe(false), { timeout: 3000 });
      expect(root().querySelector(".address")!.textContent).toBe(location.host);
    });

    it("decided otherwise (a phone, a narrow window): the static page goes and the static splash may show again", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" }));
      const element = staticLanding();
      mount();
      expect(landing.hidden).toBe(true);
      expect(element.isConnected).toBe(false);
      expect(document.documentElement.hasAttribute(LANDING_ATTRIBUTE)).toBe(false);
      await expect(landing.whenDone()).resolves.toBeUndefined();
    });
  });
});
