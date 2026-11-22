import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en/landing.json";
import { goldButton } from "@/components/buttons";
import { DESIGN_PRIMITIVES_CSS } from "@/styles/design-css";
import { isEntryInExperience } from "@shared/types/game-config";
import { LANDING_SKIPPED_KEY } from "../desktop-visitor";
import { LANDING_CONFIG } from "../landing-config";
import {
  fillTexts, LANDING_ATTRIBUTE, landingImages, renderLanding, renderStaticLanding, SCATTER_COUNT, STATIC_LANDING_ID,
  type LandingSource,
} from "../landing-html";

const source = (over: Partial<LandingSource> = {}): LandingSource => ({
  ...LANDING_CONFIG,
  texts: fillTexts(en, { title: "Onion Skin & Crocodile Tears", author: "Kévin <Bray>" }),
  title: "Onion Skin & Crocodile Tears",
  author: "Kévin <Bray>",
  publisher: "Building Fictions",
  images: Array.from({ length: 20 }, (_, i) => `/assets/content/targets/t${i}.webp`),
  markSrc: "/assets/ui/onboarding/icon.png",
  ...over,
});

describe("the landing page's markup (#343)", () => {
  it("sets the title as on the book's title page, in the gold gradient", () => {
    const html = renderLanding(source());
    expect(html).toContain('<span class="line gold shimmer">Onion Skin</span><span class="line gold shimmer and">&amp;</span><span class="line gold shimmer">Crocodile Tears</span>');
    expect(html).toContain('<p class="author gold">Kévin &lt;Bray&gt;</p>');
  });

  it("fills the intro as t() does: the values escaped, the text's own markup kept", () => {
    const texts = fillTexts(en, { title: "A & B", author: "<x>" });
    expect(texts.intro).toContain("<em>A &amp; B</em> by &lt;x&gt;");
    expect(texts.getApp).toBe(en.getApp);
  });

  it("scatters a stable pick of the images, at most one per spot", () => {
    const html = renderLanding(source());
    const floats = html.match(/class="float"/g) ?? [];
    expect(floats).toHaveLength(SCATTER_COUNT);
    expect(renderLanding(source())).toBe(html);
    expect(renderLanding(source({ images: ["/a.webp", "/a.webp", ""] })).match(/class="float"/g)).toHaveLength(1);
  });

  it("has the Mark, the phone, the QR card, the three steps, the shop and the footer; the address is filled at runtime", () => {
    const html = renderLanding(source());
    expect(html).toContain('<img class="mark" src="/assets/ui/onboarding/icon.png"');
    expect(html).toContain(`<img src="${LANDING_CONFIG.previewImage}"`);
    expect(html).toContain('<div class="qr-code" role="img"');
    expect(html.match(/class="step"/g)).toHaveLength(3);
    expect(html).toContain(goldButton({ label: en.openHere, shape: "button", primary: true, attrs: { "data-action": "continue" } }));
    LANDING_CONFIG.shop.forEach(item => expect(html).toContain(`href="${item.url}"`));
    expect(html).toContain("<span>Onion Skin &amp; Crocodile Tears · Kévin &lt;Bray&gt;</span><span>Building Fictions</span>".replace("</span><span>", "</span>\n            <span>"));
    expect(html).toContain('<span class="address gold"></span>');
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

  it("writes the address and lets \"Open the app here\" work before the bundle (remembered as skipLanding does)", () => {
    // happy-dom does not attach declarative shadow roots: build the host by hand and run the script
    const host = document.createElement("div");
    host.id = STATIC_LANDING_ID;
    host.attachShadow({ mode: "open" }).innerHTML = renderLanding(source());
    document.body.appendChild(host);
    document.documentElement.setAttribute(LANDING_ATTRIBUTE, "");
    const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
    new Function(script)();
    expect(host.shadowRoot!.querySelector(".address")!.textContent).toBe(location.host);
    host.shadowRoot!.querySelector<HTMLElement>('[data-action="continue"] span')!.click();
    expect(sessionStorage.getItem(LANDING_SKIPPED_KEY)).toBe("1");
    expect(host.isConnected).toBe(false);
    expect(document.documentElement.hasAttribute(LANDING_ATTRIBUTE)).toBe(false);
    sessionStorage.removeItem(LANDING_SKIPPED_KEY);
  });
});
