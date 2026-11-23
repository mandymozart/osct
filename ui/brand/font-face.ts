/**
 * The brand's typeface (ABC Areal by Dinamo, agents/DESIGN.md §2) as `@font-face` rules: the reader writes them into
 * `index.html` at build time (vite.config.js, `transformIndexHtml`); the editor declares them on its document for the
 * landing piece it shows (`fontFaceRules` – a family only the piece's tokens ask for, so the editor's own type stays its
 * own). The font files are licensed and never in git: they come from the font folder on the CDN (`VITE_FONT_BASE_URL`,
 * docs/content-cdn.md), and the reader's service worker keeps them for offline use (sw/service-worker.ts). Declared on
 * the document, so every shadow root uses them too. Until a file has loaded, or when it cannot be reached, the text
 * stays in the fallback of `--font-design` (Arial) – `font-display: swap`.
 *
 * No imports: vite.config.js loads this file directly (no path aliases there).
 */

/** The font folder on the CDN: shared by every environment, outside the content versions */
export const DEFAULT_FONT_BASE_URL = "https://buildingfictions.b-cdn.net/fonts/abc-areal";

/** The family name `--font-design` (ui/brand/tokens.css) asks for */
export const DESIGN_FONT_FAMILY = "ABC Areal";

/**
 * The files, as named on the CDN: upright = the variable font (weight 400–700 in one file), italic = the static
 * Regular Italic (the italic of the variable font is a slant axis, not a true italic)
 */
export const FONT_FILES = {
  upright: "ABCArealVariable.woff2",
  italic: "ABCAreal-RegularItalic.woff2",
} as const;

/** The font base URL of a build: `VITE_FONT_BASE_URL` when set (an empty value = no web font, Arial), else the CDN */
export function fontBaseUrl(configured: string | undefined): string {
  return (configured ?? DEFAULT_FONT_BASE_URL).trim().replace(/\/+$/, "");
}

/** The URLs of the font files under a base URL (the service worker caches everything under the base) */
export function fontFileUrls(baseUrl: string): { upright: string; italic: string } {
  return { upright: `${baseUrl}/${FONT_FILES.upright}`, italic: `${baseUrl}/${FONT_FILES.italic}` };
}

/** The `@font-face` rules alone (upright and italic); empty without a base URL */
export function fontFaceRules(baseUrl: string): string {
  if (!baseUrl) return "";
  const urls = fontFileUrls(baseUrl);
  const face = (url: string, style: string, weight: string) =>
    `@font-face { font-family: "${DESIGN_FONT_FAMILY}"; src: url("${url}") format("woff2"); ` +
    `font-style: ${style}; font-weight: ${weight}; font-display: swap; }`;
  return `${face(urls.upright, "normal", "400 700")} ${face(urls.italic, "italic", "400")}`;
}

/**
 * The `<head>` markup: a preload of the upright file (the first text paints in it) and the `@font-face` rules.
 * Empty without a base URL.
 */
export function renderFontFaces(baseUrl: string): string {
  if (!baseUrl) return "";
  return [
    `<link rel="preload" href="${fontFileUrls(baseUrl).upright}" as="font" type="font/woff2" crossorigin>`,
    `<style id="osct-font">${fontFaceRules(baseUrl)}</style>`,
  ].join("\n    ");
}
