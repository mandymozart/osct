/**
 * A deploy replaces the editor's code files under an open tab, and while it uploads, a new page can name files that are
 * not there yet. A code file that then fails to load – Vite's `vite:preloadError` for a dynamic import (e.g. Monaco for
 * the Code tab), or a rejected dynamic import nobody handled – is reported to `onStale`, which shows the new-version bar
 * (`new-version.ts`). Nothing reloads here, and the error still reaches the code that imported, so a panel says what it
 * could not load.
 */

/** A dynamic import's failure as the browsers word it (Chromium, Firefox, Safari) or Vite's preload of its CSS */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** The reason is a code file that could not be loaded */
export const isChunkLoadError = (reason: unknown): boolean =>
  CHUNK_ERROR.test(reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "");

/** Report code files that fail to load; returns the remover */
export const noticeStaleChunks = (onStale: () => void, win: Window = window): (() => void) => {
  const onPreloadError = () => onStale();
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) onStale();
  };
  win.addEventListener("vite:preloadError", onPreloadError);
  win.addEventListener("unhandledrejection", onRejection);
  return () => {
    win.removeEventListener("vite:preloadError", onPreloadError);
    win.removeEventListener("unhandledrejection", onRejection);
  };
};
