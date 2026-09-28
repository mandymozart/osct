/**
 * Runtime control of the static splash in index.html (markup from utils/static-splash-html.ts). The app
 * starts underneath with the step after the splash; `releaseStaticSplash()` fades the splash out once the
 * app is ready – immediately (deep link) or when the step's `advance` time since first paint is up (a tap skips).
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
 * Index of the onboarding step the splash is showing (undefined when gone or a plain loader). The
 * onboarding continues after this step instead of repeating it.
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

/** Fade the splash out once the app is ready; with `wait`, not before the step's `advance` time since first paint (a tap skips). */
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
