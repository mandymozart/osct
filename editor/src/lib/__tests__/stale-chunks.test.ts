import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, noticeStaleChunks } from "../stale-chunks";

describe("a code file that fails to load shows the new-version bar (#160, #230)", () => {
  it("reports Vite's preload error, never reloads and lets the error reach the importer", () => {
    const onStale = vi.fn();
    const off = noticeStaleChunks(onStale);
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    off();
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("reports an unhandled rejection only when it is a dynamic import that failed", () => {
    const onStale = vi.fn();
    const off = noticeStaleChunks(onStale);
    const reject = (reason: unknown) => {
      const event = new Event("unhandledrejection") as PromiseRejectionEvent;
      Object.defineProperty(event, "reason", { value: reason });
      window.dispatchEvent(event);
    };
    reject(new Error("network down"));
    expect(onStale).not.toHaveBeenCalled();
    reject(new TypeError("Failed to fetch dynamically imported module: https://x/editor/_app/immutable/chunks/a.js"));
    expect(onStale).toHaveBeenCalledTimes(1);
    off();
  });

  it("knows the browsers' wordings and Vite's CSS preload", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: /a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /a.css"))).toBe(true);
    expect(isChunkLoadError(new Error("401 unauthorized"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
