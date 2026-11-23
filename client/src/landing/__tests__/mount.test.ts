import { afterEach, describe, expect, it, vi } from "vitest";
import { isDesktopVisitor, LANDING_CONFIG, type LandingData, landingMode, landingQrUrl, landingTexts, mountLanding, privacyHref, readDeviceSignals } from "..";
import { renderLanding, SKELETON_ATTRIBUTE, CONTAINED_ATTRIBUTE } from "../landing-html";
import { DESIGN_PRIMITIVES_CSS } from "@/styles/design-css";

const desktop = { standalone: false, coarsePointer: false, mobileAgent: false, wide: true };

describe("isDesktopVisitor and landingMode", () => {
  it("is true for a computer: fine pointer, desktop browser, wide window", () => {
    expect(isDesktopVisitor(desktop)).toBe(true);
  });

  it("is false for phones and tablets, the installed app and narrow windows", () => {
    expect(isDesktopVisitor({ ...desktop, coarsePointer: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, mobileAgent: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, standalone: true })).toBe(false);
    expect(isDesktopVisitor({ ...desktop, wide: false })).toBe(false);
  });

  it("gives a computer the landing on every experience's path – the static page on the default's, placeholders elsewhere (#355)", () => {
    expect(landingMode(desktop, false, "osct", "osct")).toBe("page");
    expect(landingMode(desktop, false, null, null)).toBe("page");
    expect(landingMode(desktop, false, "demo", "osct")).toBe("skeleton");
    expect(landingMode(desktop, true, "demo", "osct")).toBeNull();
    expect(landingMode({ ...desktop, coarsePointer: true }, false, "osct", "osct")).toBeNull();
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

const DATA: LandingData = {
  experience: "osct",
  title: "Onion Skin & Crocodile Tears",
  author: "Kévin Bray",
  publisher: "Building Fictions",
  images: ["/assets/content/a.webp", "/assets/content/b.webp"],
  cover: "https://cdn/osct/abc/assets/content/layout/cover.webp",
  hero: null,
  shop: LANDING_CONFIG.shop,
};

/** The landing piece (#355): a function of its data and a host – nothing of the app */
describe("mountLanding", () => {
  const input = (data: LandingData = DATA, language: "en" | "de" = "en") => ({
    data,
    texts: landingTexts(language, { title: data.title, author: data.author }),
    qrUrl: "https://osct.example/osct/?s=lp1",
    address: "osct.example",
    privacyHref: "/osct/privacy",
  });
  const host = () => document.body.appendChild(document.createElement("div"));
  afterEach(() => vi.unstubAllGlobals());

  it("renders the page from the data passed in: title, address, shop with the book's cover, the privacy link", () => {
    const element = host();
    mountLanding(element, input());
    const root = element.shadowRoot!;
    expect(root.textContent).toContain("Get the app");
    expect(root.querySelector("h1")!.textContent).toBe("Onion Skin&Crocodile Tears");
    expect(root.querySelector(".address")!.textContent).toBe("osct.example");
    expect(root.querySelector<HTMLImageElement>('[data-item="book"] img')!.src).toBe(DATA.cover);
    expect(root.querySelector<HTMLAnchorElement>('footer a')!.getAttribute("href")).toBe("/osct/privacy");
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(".shop a"));
    expect(links.map(link => link.getAttribute("href"))).toEqual(LANDING_CONFIG.shop.map(item => item.url));
    expect(root.querySelector('[data-action="continue"], settings-install')).toBeNull();
  });

  it("keeps the static page when its own render is the same, and replaces it when not (another language)", () => {
    const element = host();
    element.attachShadow({ mode: "open" }).innerHTML = `<style>${DESIGN_PRIMITIVES_CSS}</style>${renderLanding({
      shop: DATA.shop, texts: input().texts, title: DATA.title, author: DATA.author, publisher: DATA.publisher, images: DATA.images,
      privacyHref: "/osct/privacy",
    })}`;
    element.setAttribute(SKELETON_ATTRIBUTE, "");
    const main = element.shadowRoot!.querySelector("main");
    mountLanding(element, input());
    expect(element.shadowRoot!.querySelector("main")).toBe(main);
    expect(element.hasAttribute(SKELETON_ATTRIBUTE)).toBe(false);
    mountLanding(element, input(DATA, "de"));
    expect(element.shadowRoot!.querySelector("main")).not.toBe(main);
    expect(element.shadowRoot!.textContent).toContain("Hol dir die App");
  });

  it("draws the QR code of the address it was given, then stops its placeholder", async () => {
    const made: Array<{ text?: string }> = [];
    vi.stubGlobal("QRCode", Object.assign(function (this: unknown, el: HTMLElement, options: { text?: string }) {
      made.push(options);
      el.appendChild(document.createElement("img"));
    }, { CorrectLevel: { L: 1, M: 0, Q: 3, H: 2 } }));
    const element = host();
    const view = mountLanding(element, input());
    await view.ready;
    expect(made[0].text).toBe("https://osct.example/osct/?s=lp1");
    const box = element.shadowRoot!.querySelector(".qr-code")!;
    expect(box.classList.contains("loading")).toBe(false);
    expect(box.querySelector("img")!.getAttribute("alt")).toBe("QR code that opens the app on your phone");
    // no hero in the data: the stage stops its placeholder and stays its quiet glow
    expect(element.shadowRoot!.querySelector(".stage")!.classList.contains("loading")).toBe(false);
    view.stop();
  });

  it("can live inside another page's box (the editor's stage, later)", () => {
    const element = host();
    mountLanding(element, input(), { contained: true });
    expect(element.hasAttribute(CONTAINED_ATTRIBUTE)).toBe(true);
  });
});

describe("the landing's links", () => {
  it("opens the app on a phone with the landing as its source (?s=lp1, #324), below the experience's path", () => {
    expect(landingQrUrl("https://osct.buildingfictions.com", "")).toBe("https://osct.buildingfictions.com/?s=lp1");
    expect(landingQrUrl("https://osct.buildingfictions.com", "/osct")).toBe("https://osct.buildingfictions.com/osct/?s=lp1");
  });

  it("links the static Privacy & terms page below the experience's path (#355)", () => {
    expect(privacyHref("/osct")).toBe("/osct/privacy");
    expect(privacyHref("")).toBe("/privacy");
  });
});
