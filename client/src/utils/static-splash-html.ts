/**
 * Renders the first onboarding step as plain HTML into `index.html` at build time (vite.config.js,
 * `transformIndexHtml`) so it paints before any script loads. `utils/static-splash.ts` removes it at runtime.
 *
 * No imports: vite.config.js loads this file directly (no path aliases there).
 */

/** The step fields the splash needs (`Step` in types/tutorial.ts) */
export interface SplashStepSource {
  id: string;
  index: number;
  title?: string;
  description?: string;
  footer?: string;
  button?: string;
  fadeIn?: number;
  fadeAfter?: number;
  advance?: number;
}

/**
 * The icon of the splash and the onboarding steps (#281): the design's green eye, a placeholder until Kévin's icon
 * arrives – swap the file in `public/` (same name, same proportions) and nothing else changes. Its size and place in
 * row 1 are tokens in `main.css` (`--onboarding-icon-*`). The header shows the same eye (#297).
 */
export const ONBOARDING_ICON_SRC = "/assets/ui/onboarding/icon.png";

/**
 * The onboarding's first step, the splash (design p. 5–7, #281): the icon and the book's title at once, then the
 * author and the publisher fade in together (after 1 s, over 1 s); it advances by itself (or on a tap). The app's
 * onboarding starts with it (`utils/onboarding.ts`).
 */
export const SPLASH_STEP: SplashStepSource = {
  id: "splash",
  index: 0,
  title: "{{title}}",
  description: "{{author}}",
  footer: "{{publisher}}",
  fadeIn: 1000,
  fadeAfter: 1000,
  advance: 3800,
};

export interface StaticSplashSource {
  book: Record<string, string | undefined>;
  /** The step to show (the splash); none – a plain loader */
  step?: SplashStepSource;
  /** The icon in row 1 (`ONBOARDING_ICON_SRC`); decorative, the title follows */
  iconSrc: string;
  /** Screen reader text while the app loads */
  loadingLabel: string;
}

/** Must match the default of splash-page */
const DEFAULT_ADVANCE_MS = 2000;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fill = (text: string, book: StaticSplashSource["book"]): string =>
  text.replace(/\{\{(title|author|publisher)\}\}/g, (_, field: string) => book[field] ?? "").trim();

const inline = (text: string, book: StaticSplashSource["book"]): string =>
  escapeHtml(fill(text, book)).replace(/\*([^*]+)\*/g, "<em>$1</em>");

const paragraphs = (text: string): string[] => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

/**
 * `<div id="static-splash">` plus a first-paint timestamp script. Like tutorial-content: the icon and the title show at
 * once, the text and the footer fade in together after `fadeAfter` (a step without `fadeIn` shows everything at once);
 * the parts sit on the same vertical grid (icon row 1, row 2 empty, title and text from row 3, footer from row 5);
 * the title shimmers. `data-step` / `data-advance` tell the app which step it showed and for how long.
 */
export const renderStaticSplash = ({ book, step, iconSrc, loadingLabel }: StaticSplashSource): string => {
  const stamp = `<script>window.__osctSplashAt = performance.now();</script>`;
  if (!step) {
    return `<div id="static-splash" role="status" aria-label="${escapeHtml(loadingLabel)}"><div class="gold-spinner"></div></div>${stamp}`;
  }
  const fades = step.fadeIn !== undefined && step.fadeIn > 0;
  const fade = (className = "") => {
    const classes = [fades ? "fade" : "", className].filter(Boolean).join(" ");
    return `${classes ? `class="${classes}"` : ""}${fades ? ` style="animation-delay: ${step.fadeAfter ?? 0}ms"` : ""}`;
  };
  const title = step.title && fill(step.title, book);
  const text = step.description && fill(step.description, book);
  const footer = step.footer && fill(step.footer, book);
  return [
    `<div id="static-splash" role="status" aria-label="${escapeHtml(loadingLabel)}"`,
    ` data-step="${step.index}" data-advance="${step.advance ?? DEFAULT_ADVANCE_MS}"${fades ? ` style="--fade-duration: ${step.fadeIn}ms"` : ""}>`,
    `<div class="content"><div class="row icon-row">`,
    `<img src="${escapeHtml(iconSrc)}" alt="" data-icon>`,
    `</div><div class="row"></div><div class="head">`,
    step.title && title ? `<h1><span class="gold shimmer">${inline(step.title, book)}</span></h1>` : "",
    step.description && text ? `<div ${fade()}>${paragraphs(step.description).map(p => `<p class="gold">${inline(p, book)}</p>`).join("")}</div>` : "",
    `</div>`,
    step.footer && footer ? `<div ${fade("footer")}><span class="gold">${inline(step.footer, book)}</span></div>` : "",
    `</div></div>${stamp}`,
  ].join("");
};
