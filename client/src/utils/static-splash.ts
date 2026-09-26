/**
 * The static splash in index.html (utils/static-splash-html.ts) – the first onboarding step, painted before
 * the app's scripts load. The app starts underneath with the *next* step of the flow; `release()` fades
 * the splash out once the app is ready: at once (a link opened a view) or when the step's time is up,
 * counted from its first paint (a tap skips).
 */

declare global {
  interface Window {
    /** performance.now() when the splash markup was parsed (inline script in index.html) */
    __osctSplashAt?: number;
  }
}

const FADE_MS = 600; // static-splash.css transition

let hiding = false;
let resolveHidden: () => void = () => {};
const hidden = new Promise<void>(resolve => (resolveHidden = resolve));

const element = (): HTMLElement | null => document.getElementById("static-splash");

/**
 * The onboarding step the splash shows while it is on screen (undefined: gone, or a plain loader). The splash
 * page / onboarding continue after it instead of showing it again.
 */
export const staticSplashStep = (): number | undefined => {
  const value = element()?.dataset.step;
  return value === undefined ? undefined : Number(value);
};

/** Fade out and remove the splash (resolves when it is gone; at once if there is none) */
export const hideStaticSplash = (): Promise<void> => {
  const el = element();
  if (!el) resolveHidden();
  if (!el || hiding) return whenStaticSplashHidden();
  hiding = true;
  el.classList.add("hiding");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    el.remove();
    resolveHidden();
  }, reduced ? 0 : FADE_MS);
  return hidden;
};

/** Resolves once the splash is gone (at once when there is none) */
export const whenStaticSplashHidden = (): Promise<void> => (element() ? hidden : Promise.resolve());

/**
 * The app is ready: fade the splash out – `wait`: not before the step's `advance` time since its first
 * paint (a tap on it skips the rest).
 */
export const releaseStaticSplash = ({ wait }: { wait: boolean }): Promise<void> => {
  const el = element();
  if (!el) return hideStaticSplash();
  const advance = Number(el.dataset.advance ?? 0);
  const shownAt = window.__osctSplashAt ?? 0;
  const remaining = wait ? Math.max(0, advance - (performance.now() - shownAt)) : 0;
  if (remaining <= 0) return hideStaticSplash();
  const timer = window.setTimeout(() => void hideStaticSplash(), remaining);
  el.addEventListener("click", () => {
    window.clearTimeout(timer);
    void hideStaticSplash();
  }, { once: true });
  return whenStaticSplashHidden();
};
