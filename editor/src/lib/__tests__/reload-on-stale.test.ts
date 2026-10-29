import { afterEach, describe, expect, it, vi } from "vitest";
import { RELOAD_GAP_MS, reloadOnStaleChunks } from "../reload-on-stale";

describe("reload on a chunk that failed to load (#160)", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  const fire = () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  };

  it("reloads once and keeps the error from being thrown", () => {
    const reload = vi.fn();
    const off = reloadOnStaleChunks(window, reload);
    const event = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    off();
  });

  it("does not loop: a second failure right after a reload shows its error", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const off = reloadOnStaleChunks(window, reload);
    fire();
    const second = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(RELOAD_GAP_MS + 1);
    fire();
    expect(reload).toHaveBeenCalledTimes(2);
    off();
  });
});
