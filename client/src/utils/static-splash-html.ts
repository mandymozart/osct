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
  stagger?: number;
  advance?: number;
}

/**
 * The onboarding's first step, the splash: Mark, then the book's title, author and publisher fade in one after the
 * other, 0.5 s apart; it advances by itself (or on a tap). The app's onboarding starts with it (`utils/onboarding.ts`).
 */
export const SPLASH_STEP: SplashStepSource = {
  id: "splash",
  index: 0,
  title: "{{title}}",
  description: "{{author}}",
  footer: "{{publisher}}",
  fadeIn: 800,
  stagger: 500,
  advance: 3800,
};

export interface StaticSplashSource {
  book: Record<string, string | undefined>;
  /** The step to show (the splash); none – a plain loader */
  step?: SplashStepSource;
  markSrc: string;
  markAlt: string;
  /** Screen reader text while the app loads */
  loadingLabel: string;
}

/** Must match the defaults of tutorial-content / splash-page */
const DEFAULT_FADE_MS = 600;
const DEFAULT_STAGGER_MS = 250;
const DEFAULT_ADVANCE_MS = 2000;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fill = (text: string, book: StaticSplashSource["book"]): string =>
  text.replace(/\{\{(title|author|publisher)\}\}/g, (_, field: string) => book[field] ?? "").trim();

const inline = (text: string, book: StaticSplashSource["book"]): string =>
  escapeHtml(fill(text, book)).replace(/\*([^*]+)\*/g, "<em>$1</em>");

const paragraphs = (text: string): string[] => text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

/**
 * `<div id="static-splash">` plus a first-paint timestamp script. Parts fade in staggered like tutorial-content
 * (Mark, title, text, footer); `data-step` / `data-advance` tell the app which step it showed and for how long.
 */
export const renderStaticSplash = ({ book, step, markSrc, markAlt, loadingLabel }: StaticSplashSource): string => {
  const stamp = `<script>window.__osctSplashAt = performance.now();</script>`;
  if (!step) {
    return `<div id="static-splash" role="status" aria-label="${escapeHtml(loadingLabel)}"><div class="gold-spinner"></div></div>${stamp}`;
  }
  const duration = step.fadeIn ?? DEFAULT_FADE_MS;
  const stagger = step.stagger ?? DEFAULT_STAGGER_MS;
  let slot = 0;
  const next = () => `class="fade" style="animation-delay: ${slot++ * stagger}ms"`;
  const title = step.title && fill(step.title, book);
  const text = step.description && fill(step.description, book);
  const footer = step.footer && fill(step.footer, book);
  return [
    `<div id="static-splash" role="status" aria-label="${escapeHtml(loadingLabel)}"`,
    ` data-step="${step.index}" data-advance="${step.advance ?? DEFAULT_ADVANCE_MS}" style="--fade-duration: ${duration}ms">`,
    `<div class="content"><div class="head">`,
    `<img ${next()} src="${escapeHtml(markSrc)}" alt="${escapeHtml(markAlt)}" width="99" height="96">`,
    step.title && title ? `<h1 ${next()}><span class="gold">${inline(step.title, book)}</span></h1>` : "",
    step.description && text ? `<div ${next()}>${paragraphs(step.description).map(p => `<p class="gold">${inline(p, book)}</p>`).join("")}</div>` : "",
    `</div>`,
    step.footer && footer ? `<div ${next().replace('class="fade"', 'class="fade footer"')}><span class="gold">${inline(step.footer, book)}</span></div>` : "",
    `</div></div>${stamp}`,
  ].join("");
};
