import { describe, expect, it } from "vitest";
import { DEFAULT_FONT_BASE_URL, fontBaseUrl, fontFileUrls, renderFontFaces } from "../font-face";

describe("design font (index.html)", () => {
  it("loads from the CDN font folder unless the build sets another base URL; an empty one means no web font", () => {
    expect(fontBaseUrl(undefined)).toBe(DEFAULT_FONT_BASE_URL);
    expect(fontBaseUrl("https://cdn.example/fonts/areal/")).toBe("https://cdn.example/fonts/areal");
    expect(fontBaseUrl("")).toBe("");
  });

  it("declares the variable upright face (400–700) and the italic, swapping in once loaded", () => {
    const html = renderFontFaces("https://cdn.example/f");
    const { upright, italic } = fontFileUrls("https://cdn.example/f");
    expect(upright).toBe("https://cdn.example/f/ABCArealVariable.woff2");
    expect(html).toContain(`<link rel="preload" href="${upright}" as="font" type="font/woff2" crossorigin>`);
    expect(html).toContain(`font-family: "ABC Areal"; src: url("${upright}") format("woff2"); font-style: normal; font-weight: 400 700`);
    expect(html).toContain(`src: url("${italic}") format("woff2"); font-style: italic; font-weight: 400`);
    expect(html.match(/font-display: swap/g)).toHaveLength(2);
  });

  it("writes nothing without a base URL (the text stays in the fallback, Arial)", () => {
    expect(renderFontFaces("")).toBe("");
  });
});
