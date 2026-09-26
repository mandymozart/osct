import { describe, expect, it } from "vitest";
import { renderStaticSplash, SplashStepSource, staticSplashStep } from "../static-splash-html";

const book = { title: "Onion Skin & Crocodile Tears", author: "Kévin Bray", publisher: "Building Fictions" };
const splash: SplashStepSource = { index: 0, title: "{{title}}", description: "{{author}}", footer: "{{publisher}}", fadeIn: 800, stagger: 500, advance: 3800 };
const intro: SplashStepSource = { index: 1, description: "Reveal *{{title}}*", button: "Continue" };
const source = (steps: SplashStepSource[]) => ({ book, steps, markSrc: "/mark.png", markAlt: "Mark the Page", loadingLabel: "Loading book" });

describe("static splash (index.html)", () => {
  it("shows the first onboarding step if it is a splash step (no button)", () => {
    expect(staticSplashStep([intro, splash])).toBe(splash);
    expect(staticSplashStep([intro])).toBeUndefined();
    expect(staticSplashStep([])).toBeUndefined();
  });

  it("renders the book fields, escaped, fading in one after the other like tutorial-content", () => {
    const html = renderStaticSplash(source([intro, splash]));
    expect(html).toContain('data-step="0" data-advance="3800" style="--fade-duration: 800ms"');
    expect(html).toContain('<img class="fade" style="animation-delay: 0ms" src="/mark.png" alt="Mark the Page"');
    expect(html).toContain('<h1 class="fade" style="animation-delay: 500ms"><span class="gold">Onion Skin &amp; Crocodile Tears</span></h1>');
    expect(html).toContain('style="animation-delay: 1000ms"><p class="gold">Kévin Bray</p>');
    expect(html).toContain('class="fade footer" style="animation-delay: 1500ms"><span class="gold">Building Fictions</span>');
    expect(html).toContain('aria-label="Loading book"');
    expect(html).toContain("window.__osctSplashAt = performance.now()");
  });

  it("falls back to a loader when the onboarding starts with a button step", () => {
    const html = renderStaticSplash(source([intro]));
    expect(html).toContain('<div class="gold-spinner"></div>');
    expect(html).not.toContain("data-step");
  });
});
