import { describe, expect, it } from "vitest";
import { renderStaticSplash, SPLASH_STEP, type SplashStepSource } from "../static-splash-html";

const book = { title: "Onion Skin & Crocodile Tears", author: "Kévin Bray", publisher: "Building Fictions" };
const source = (step?: SplashStepSource) => ({ book, step, iconSrc: "/icon.png", loadingLabel: "Loading book" });

describe("static splash (index.html)", () => {
  it("is the app's splash step: the book's title, author and publisher, no button", () => {
    expect(SPLASH_STEP).toMatchObject({ index: 0, title: "{{title}}", description: "{{author}}", footer: "{{publisher}}" });
    expect(SPLASH_STEP.button).toBeUndefined();
  });

  it("renders the book fields, escaped: icon and title at once, author and publisher fade in together (#281)", () => {
    const html = renderStaticSplash(source(SPLASH_STEP));
    expect(html).toContain('data-step="0" data-advance="3800" style="--fade-duration: 1000ms"');
    expect(html).toContain('<div class="row icon-row"><img src="/icon.png" alt="" data-icon>');
    expect(html).toContain('<h1><span class="gold shimmer">Onion Skin &amp; Crocodile Tears</span></h1>');
    expect(html).toContain('<div class="fade" style="animation-delay: 1000ms"><p class="gold">Kévin Bray</p>');
    expect(html).toContain('<div class="fade footer" style="animation-delay: 1000ms"><span class="gold">Building Fictions</span>');
    expect(html).toContain('aria-label="Loading book"');
    expect(html).toContain("window.__osctSplashAt = performance.now()");
  });

  it("places the parts on the vertical grid: icon in row 1, row 2 empty, then title and text, then the footer", () => {
    const html = renderStaticSplash(source(SPLASH_STEP));
    expect(html).toMatch(/<div class="content"><div class="row icon-row"><img [^>]*><\/div><div class="row"><\/div><div class="head"><h1>/);
    expect(html.indexOf('class="fade footer"')).toBeGreaterThan(html.indexOf("Kévin Bray"));
  });

  it("is a loader without a step", () => {
    const html = renderStaticSplash(source());
    expect(html).toContain('<div class="gold-spinner"></div>');
    expect(html).not.toContain("data-step");
  });
});
