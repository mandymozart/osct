/**
 * A deploy replaces the editor's code files under an open tab, and while it uploads, a new page can name files that
 * are not there yet (#160). A chunk that fails to load (`vite:preloadError`: Vite's own event for a dynamic import,
 * e.g. Monaco for the Code tab) then reloads the page once – at most once every `RELOAD_GAP_MS`, so a deploy still
 * uploading shows its error instead of a reload loop.
 */

const KEY = "osct-editor-stale-reload";
export const RELOAD_GAP_MS = 10_000;

/** Reload on a chunk that failed to load; returns the remover */
export const reloadOnStaleChunks = (win: Window = window, reload: () => void = () => win.location.reload()): (() => void) => {
  const onError = (event: Event) => {
    let last = 0;
    try { last = Number(win.sessionStorage.getItem(KEY) ?? 0); } catch { /* storage blocked */ }
    if (Date.now() - last < RELOAD_GAP_MS) return; // just reloaded: let the error show
    try { win.sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
    event.preventDefault();
    reload();
  };
  win.addEventListener("vite:preloadError", onError);
  return () => win.removeEventListener("vite:preloadError", onError);
};
