import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk: vitest hands CSS imports over empty, and happy-dom gives import.meta.url an http URL
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The value of a custom property in the light :root block (the first one) */
const token = (name: string) => css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();

/** Relative luminance of a #rrggbb colour (WCAG 2) */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("app.css follows the editor's UI rules (RULES #32, #170)", () => {
  it("has square corners", () => {
    expect(token("--control-radius")).toBe("0");
  });

  it("keeps small muted text readable on the surface and the heads (WCAG AA, 4.5:1)", () => {
    const muted = token("--muted")!;
    expect(contrast(muted, token("--surface")!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, token("--surface-head")!)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws one focus ring in the text colour, not the browser's", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--text\)/);
  });

  it("keeps a row's height in a scrolling flex column", () => {
    expect(css).toMatch(/\.row, \.section\s*\{\s*flex-shrink:\s*0;/);
  });
});

/** The rules of a `@media (pointer: coarse)` block's `:root` (the touch tokens) */
const coarseRoot = css.match(/@media \(pointer: coarse\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1] ?? "";
const rem = (block: string, name: string) => Number(block.match(new RegExp(`${name}\\s*:\\s*([\\d.]+)rem`))?.[1]);
/** A component's own CSS (its <style>), comments dropped */
const styleOf = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("a finger gets the touch control height (#171, the Scutoons dogma's 44px on touch)", () => {
  it("raises the one control height under (pointer: coarse) to at least 2.5rem – 44px – and the top bar with it", () => {
    expect(rem(css, "--control-height")).toBe(1.75);
    const touch = rem(coarseRoot, "--control-height");
    expect(touch).toBeGreaterThanOrEqual(2.5);
    expect(touch * 16).toBeGreaterThanOrEqual(44);
    expect(rem(coarseRoot, "--top-height")).toBeGreaterThanOrEqual(touch);
  });

  it("takes every primitive's height from the token: pills, icon buttons, fields, ScrubNumber and Segmented", () => {
    expect(css).toMatch(/\.pill, \.icon-button, \.field\s*\{[^}]*height:\s*var\(--control-height\)/);
    expect(styleOf("src/lib/components/ScrubNumber.svelte")).toMatch(/\.frame\s*\{[^}]*height:\s*var\(--control-height\)/);
    // Segmented is made of .pill buttons
    expect(styleOf("src/lib/components/Segmented.svelte")).toMatch(/class="pill"/);
  });

  it("makes the tree's rows, chevrons and eye touch-sized", () => {
    const tree = styleOf("src/lib/panels/TreePanel.svelte");
    const touch = tree.match(/@media \(pointer: coarse\)\s*\{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(touch).toMatch(/\.node\s*\{\s*height:\s*var\(--control-height\)/);
    expect(touch).toMatch(/button\.chevron, button\.eye\s*\{\s*height:\s*100%/);
    expect(touch).toMatch(/\.eye\s*\{\s*width:\s*var\(--control-height\)/);
  });
});
