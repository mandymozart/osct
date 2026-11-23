import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_PRIMITIVES_CSS } from "../../brand/design-css";
import type { LandingData } from "../data";
import { LANDING_CONFIG } from "../landing-config";
import { CONTAINED_ATTRIBUTE, renderLanding, SKELETON_ATTRIBUTE } from "../landing-html";
import { mountLanding } from "../mount";
import { landingTexts } from "../texts";

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

  it("puts a host page's styles first into its shadow root – the editor's brand tokens (#356); the reader's page has none", () => {
    const reader = host();
    mountLanding(reader, input());
    expect(reader.shadowRoot!.querySelector("style")!.textContent).toBe(DESIGN_PRIMITIVES_CSS);
    const editor = host();
    mountLanding(editor, input(), { contained: true, styles: ":host { --gold-1: #f5e7c8; }" });
    expect(editor.shadowRoot!.querySelector("style")!.textContent).toBe(`:host { --gold-1: #f5e7c8; }${DESIGN_PRIMITIVES_CSS}`);
    expect(editor.hasAttribute(CONTAINED_ATTRIBUTE)).toBe(true);
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

  it("shows an experience's own shop (#365): its labels (escaped), its links, the book's cover on a cover item; [] = no shop section", () => {
    const element = host();
    const shop = [
      { label: "The <book>", url: "https://shop/book", image: LANDING_CONFIG.shop[0].image, cover: true },
      { label: "A print", url: "https://shop/print", image: "https://cdn/print.jpg" },
      { label: "A mug", url: "https://shop/mug", image: "" },
    ];
    mountLanding(element, input({ ...DATA, shop }));
    const root = element.shadowRoot!;
    expect(Array.from(root.querySelectorAll(".shop .name")).map(name => name.textContent)).toEqual(["The <book>", "A print", "A mug"]);
    expect(Array.from(root.querySelectorAll<HTMLAnchorElement>(".shop a")).map(link => link.getAttribute("href"))).toEqual(shop.map(item => item.url));
    expect(root.querySelector<HTMLImageElement>("[data-cover] img")!.src).toBe(DATA.cover);
    expect(root.querySelector('[data-item="2"] img')).toBeNull();
    const empty = host();
    mountLanding(empty, input({ ...DATA, shop: [] }));
    expect(empty.shadowRoot!.querySelector(".shop-section")).toBeNull();
    expect(empty.shadowRoot!.querySelector("footer")).not.toBeNull();
  });

  it("updates its texts and shop in place – the hero's stage and the QR code stay as they run (the editor while typing, #365)", () => {
    const element = host();
    const view = mountLanding(element, input());
    const root = element.shadowRoot!;
    const stage = root.querySelector(".stage");
    const qr = root.querySelector(".qr-code");
    view.update({ ...input(), texts: landingTexts("en", { title: DATA.title, author: DATA.author }, { en: { intro: "Our own words" } }), data: { ...DATA, shop: [] } });
    expect(root.querySelector(".intro")!.textContent).toBe("Our own words");
    expect(root.querySelector(".shop-section")).toBeNull();
    expect(root.querySelector(".stage")).toBe(stage);
    expect(root.querySelector(".qr-code")).toBe(qr);
    expect(root.querySelector(".address")!.textContent).toBe("osct.example");
    view.stop();
  });
});
