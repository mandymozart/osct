import { describe, expect, it, vi } from "vitest";
import { DESIGN_PRIMITIVES_CSS } from "../../brand/design-css";
import en from "../locales/en/landing.json";
import { isEntryInExperience } from "@shared/types/game-config";
import { LANDING_CONFIG } from "../landing-config";
import {
  anchorHandler, COVER_SHARE, DEFAULT_COVER_ASPECT, fillTexts, LANDING_ATTRIBUTE, landingImages, renderKeyOf, renderLanding, renderStaticLanding, SCATTER_COUNT,
  SKELETON_ATTRIBUTE, STATIC_LANDING_ID, type LandingSource,
} from "../landing-html";

const source = (over: Partial<LandingSource> = {}): LandingSource => ({
  ...LANDING_CONFIG,
  texts: fillTexts(en, { title: "Onion Skin & Crocodile Tears", author: "Kévin <Bray>" }),
  title: "Onion Skin & Crocodile Tears",
  author: "Kévin <Bray>",
  publisher: "Building Fictions",
  images: Array.from({ length: 20 }, (_, i) => `/assets/content/targets/t${i}.webp`),
  ...over,
});

describe("the landing page's markup (#343)", () => {
  it("sets the title as on the book's title page, in the gold gradient", () => {
    const html = renderLanding(source());
    expect(html).toContain('<span class="line gold shimmer slot">Onion Skin</span><span class="line gold shimmer slot and">&amp;</span><span class="line gold shimmer slot">Crocodile Tears</span>');
    expect(html).toContain('<p class="author gold slot">Kévin &lt;Bray&gt;</p>');
  });

  it("fills the intro as t() does: the values escaped, the text's own markup kept", () => {
    const texts = fillTexts(en, { title: "A & B", author: "<x>" });
    expect(texts.intro).toContain("<em>A &amp; B</em> by &lt;x&gt;");
    expect(texts.getApp).toBe(en.getApp);
  });

  it("links Privacy & terms in the footer, the static page below the experience's path (#355)", () => {
    expect(renderLanding(source())).toContain(`<a href="/privacy">${en.privacy}</a>`);
    expect(renderLanding(source({ privacyHref: "/osct/privacy" }))).toContain('<a href="/osct/privacy">');
  });

  it("scatters a stable pick of the images, at most one per spot", () => {
    const html = renderLanding(source());
    const floats = html.match(/class="float"/g) ?? [];
    expect(floats).toHaveLength(SCATTER_COUNT);
    expect(renderLanding(source())).toBe(html);
    expect(renderLanding(source({ images: ["/a.webp", "/a.webp", ""] })).match(/class="float"/g)).toHaveLength(1);
  });

  it("has the stage, the QR card, the shop and the footer; the address is filled at runtime", () => {
    const html = renderLanding(source());
    expect(html).not.toContain('class="mark"');   // the Mark sits on the stage's phone screen (#354)
    expect(html).toContain(`<aside class="stage loading" role="img" aria-label="${en.previewAlt}"><div class="cover blank"`);
    expect(html).toContain('<div class="qr-code loading" role="img"');
    LANDING_CONFIG.shop.forEach(item => expect(html).toContain(`href="${item.url}"`));
    expect(html).toContain(`<span class="slot">Onion Skin &amp; Crocodile Tears · Kévin &lt;Bray&gt;</span>\n            <span><span class="slot">Building Fictions</span> · <a href="/privacy">${en.privacy}</a></span>`);
    expect(html).toContain('<span class="address gold"></span>');
  });
});

describe("the stage's stand-in (#372)", () => {
  it("is the closed book's cover where the 3D intro first shows it: its picture, the hero's page aspect", () => {
    const html = renderLanding(source({ cover: "/c/cover.webp?a=1&b=2", coverAspect: 0.75 }));
    expect(html).toContain(`<div class="cover" style="width:${(COVER_SHARE * 100).toFixed(2)}%;aspect-ratio:${(0.5 / 0.75).toFixed(4)}"><img src="/c/cover.webp?a=1&amp;b=2" alt="" decoding="async" /></div>`);
    expect(COVER_SHARE).toBeCloseTo(0.444, 3);
  });

  it("is a blank cover with a common book's shape without a picture or a hero", () => {
    const html = renderLanding(source());
    expect(html).toContain(`<div class="cover blank" style="width:44.43%;aspect-ratio:${(0.5 / DEFAULT_COVER_ASPECT).toFixed(4)}"></div>`);
  });
});

describe("the in-page links (#372)", () => {
  const page = () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = renderLanding(source());
    return root;
  };

  it("scroll the shadow root's section into view instead of looking for it in the document", () => {
    const root = page();
    const section = root.getElementById("get")!;
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    root.addEventListener("click", anchorHandler);
    const event = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, button: 0 });
    root.querySelector<HTMLAnchorElement>('a[href="#get"]')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
  });

  it("leave a click with a modifier, and one handled already, alone", () => {
    const root = page();
    const scroll = vi.fn();
    root.getElementById("get")!.scrollIntoView = scroll;
    root.addEventListener("click", anchorHandler);
    root.querySelector('a[href="#get"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("are handled by the static page's script before any code loads", () => {
    expect(renderStaticLanding(source())).toContain(' root.addEventListener("click", function anchorHandler(');
  });
});

describe("the render key (#355)", () => {
  it("is the same for the same page and another for other data or texts", () => {
    const key = renderKeyOf(renderLanding(source()));
    expect(key).toMatch(/^\w+$/);
    expect(renderKeyOf(renderLanding(source()))).toBe(key);
    expect(renderKeyOf(renderLanding(source({ title: "Demo" })))).not.toBe(key);
    expect(renderKeyOf(renderLanding(source({ texts: { ...source().texts, getApp: "Hol dir die App" } })))).not.toBe(key);
  });

  it("marks the experience's own parts as placeholders and the slow ones as loading", () => {
    const html = renderLanding(source());
    expect(html.match(/class="[^"]*\bslot\b/g)?.length).toBeGreaterThanOrEqual(6);   // title lines, author, intro, footer, publisher, cover
    expect(html).toContain('<div class="picture slot">');
  });
});

describe("landingImages", () => {
  it("lists the targets' images as getScenes does: scene order, switched-off targets left out, once each", () => {
    const config = {
      scenes: [{ id: "b" }, { id: "a" }],
      entries: [
        { scene: "a", target: { imageSrc: "/assets/content/a1.webp" } },
        { scene: "b", target: { imageSrc: "/assets/content/b1.webp" } },
        { scene: "b", target: { imageSrc: "/assets/content/off.webp", enabled: false } },
        { scene: "b" },
        { scene: "a", target: { imageSrc: "/assets/content/b1.webp" } },
      ],
    };
    expect(landingImages(config)).toEqual(["/assets/content/b1.webp", "/assets/content/a1.webp"]);
    expect(landingImages(config, path => `https://cdn/osct/42${path}`)[0]).toBe("https://cdn/osct/42/assets/content/b1.webp");
    expect(landingImages({})).toEqual([]);
    // the same filter as the reader's
    expect(config.entries.filter(isEntryInExperience as (e: unknown) => boolean)).toHaveLength(4);
  });
});

describe("the static landing for index.html", () => {
  const html = renderStaticLanding(source());

  it("is the page in a declarative shadow root with the design primitives, shown only for <html data-osct-landing>", () => {
    expect(html).toContain(`<div id="${STATIC_LANDING_ID}"><template shadowrootmode="open"><style>${DESIGN_PRIMITIVES_CSS}</style>${renderLanding(source())}</template></div>`);
    expect(html).toContain(`html:not([${LANDING_ATTRIBUTE}]) #${STATIC_LANDING_ID}{display:none}`);
    expect(html).toContain(`html[${LANDING_ATTRIBUTE}] #static-splash{display:none}`);
  });

  // happy-dom does not attach declarative shadow roots: build the host by hand and run the script
  const runScript = (mode: string) => {
    const host = document.createElement("div");
    host.id = STATIC_LANDING_ID;
    host.attachShadow({ mode: "open" }).innerHTML = renderLanding(source());
    document.body.appendChild(host);
    document.documentElement.setAttribute(LANDING_ATTRIBUTE, mode);
    const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
    new Function(script)();
    document.documentElement.removeAttribute(LANDING_ATTRIBUTE);
    return host;
  };

  it("writes the address before any code; a computer cannot enter the app or install it (#354)", () => {
    const host = runScript("page");
    expect(host.shadowRoot!.querySelector(".address")!.textContent).toBe(location.host);
    expect(host.shadowRoot!.querySelector('[data-action="continue"], settings-install, .kicker, .steps')).toBeNull();
    expect(host.hasAttribute(SKELETON_ATTRIBUTE)).toBe(false);
  });

  it("on another experience's path turns the experience's parts into placeholders (#355)", () => {
    expect(runScript("skeleton").hasAttribute(SKELETON_ATTRIBUTE)).toBe(true);
  });
});
