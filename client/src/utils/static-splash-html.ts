/**
 * The static splash (Phase 9): the first onboarding step as plain HTML in `index.html`, written at build
 * time from the game configuration (vite.config.js, `transformIndexHtml`) – it paints before any script
 * has loaded. `utils/static-splash.ts` fades it out once the app is ready.
 *
 * No imports: vite.config.js loads this file directly (no path aliases there).
 */

/** The step fields the splash needs (StepData in shared/types) */
export interface SplashStepSource {
  index: number;
  title?: string;
  description?: string;
  footer?: string;
  button?: string;
  fadeIn?: number;
  stagger?: number;
  advance?: number;
}

export interface StaticSplashSource {
  book: Record<string, string | undefined>;
  steps: readonly SplashStepSource[];
  markSrc: string;
  markAlt: string;
  /** Screen reader text while the app loads */
  loadingLabel: string;
}

/** Same defaults as tutorial-content / splash-page */
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

/** The step the static splash shows: the first one, if it is a splash step (no button) */
export const staticSplashStep = (steps: readonly SplashStepSource[]): SplashStepSource | undefined => {
  const first = [...steps].sort((a, b) => a.index - b.index)[0];
  return first && !first.button ? first : undefined;
};

/**
 * `<div id="static-splash">` + a timestamp script. Parts fade in one after the other like tutorial-content
 * (Mark, title, text, footer); `data-step` / `data-advance` tell the app which step it showed and for how long.
 */
export const renderStaticSplash = ({ book, steps, markSrc, markAlt, loadingLabel }: StaticSplashSource): string => {
  const step = staticSplashStep(steps);
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
    title ? `<h1 ${next()}><span class="gold">${inline(step.title!, book)}</span></h1>` : "",
    text ? `<div ${next()}>${paragraphs(step.description!).map(p => `<p class="gold">${inline(p, book)}</p>`).join("")}</div>` : "",
    `</div>`,
    footer ? `<div ${next().replace('class="fade"', 'class="fade footer"')}><span class="gold">${inline(step.footer!, book)}</span></div>` : "",
    `</div></div>${stamp}`,
  ].join("");
};
