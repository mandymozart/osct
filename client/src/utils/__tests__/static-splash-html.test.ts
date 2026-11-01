import { describe, expect, it } from "vitest";
import { renderStaticSplash, SPLASH_STEP, type SplashStepSource } from "../static-splash-html";

const book = { title: "Onion Skin & Crocodile Tears", author: "Kévin Bray", publisher: "Building Fictions" };
const source = (step?: SplashStepSource) => ({ book, step, markSrc: "/mark.png", markAlt: "Mark the Page", loadingLabel: "Loading book" });

describe("static splash (index.html)", () => {
  it("is the app's splash step: the book's title, author and publisher, no button", () => {
    expect(SPLASH_STEP).toMatchObject({ index: 0, title: "{{title}}", description: "{{author}}", footer: "{{publisher}}" });
    expect(SPLASH_STEP.button).toBeUndefined();
  });

  it("renders the book fields, escaped, fading in one after the other like tutorial-content", () => {
    const html = renderStaticSplash(source(SPLASH_STEP));
    expect(html).toContain('data-step="0" data-advance="3800" style="--fade-duration: 800ms"');
    expect(html).toContain('<img class="fade" style="animation-delay: 0ms" src="/mark.png" alt="Mark the Page"');
    expect(html).toContain('<h1 class="fade" style="animation-delay: 500ms"><span class="gold">Onion Skin &amp; Crocodile Tears</span></h1>');
    expect(html).toContain('style="animation-delay: 1000ms"><p class="gold">Kévin Bray</p>');
    expect(html).toContain('class="fade footer" style="animation-delay: 1500ms"><span class="gold">Building Fictions</span>');
    expect(html).toContain('aria-label="Loading book"');
    expect(html).toContain("window.__osctSplashAt = performance.now()");
  });

  it("is a loader without a step", () => {
    const html = renderStaticSplash(source());
    expect(html).toContain('<div class="gold-spinner"></div>');
    expect(html).not.toContain("data-step");
  });
});
