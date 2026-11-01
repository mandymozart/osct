import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPHICS_STORAGE_KEY, GraphicsService } from "../GraphicsService";

describe("GraphicsService", () => {
  beforeEach(() => localStorage.clear());

  it("starts with both options off", () => {
    expect(new GraphicsService().getSettings()).toEqual({ onionSky: false, surroundings: false });
  });

  it("stores a change on this device and tells the subscribers until they unsubscribe", () => {
    const graphics = new GraphicsService();
    const listener = vi.fn();
    const unsubscribe = graphics.subscribe(listener);
    graphics.setSettings({ surroundings: true });
    expect(listener).toHaveBeenCalledWith({ onionSky: false, surroundings: true });
    expect(new GraphicsService().getSettings()).toEqual({ onionSky: false, surroundings: true });

    unsubscribe();
    graphics.setSettings({ onionSky: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hands out copies: changing one does not change the settings", () => {
    const graphics = new GraphicsService();
    graphics.getSettings().onionSky = true;
    expect(graphics.getSettings().onionSky).toBe(false);
  });

  it("reads stored values of the right type, defaults for the rest", () => {
    localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify({ onionSky: true, surroundings: "yes" }));
    expect(new GraphicsService().getSettings()).toEqual({ onionSky: true, surroundings: false });
    for (const stored of ["not json", "[true, true]", "true", "null"]) {
      localStorage.setItem(GRAPHICS_STORAGE_KEY, stored);
      expect(new GraphicsService().getSettings()).toEqual({ onionSky: false, surroundings: false });
    }
  });

  it("keeps a change for the session when the storage refuses it", () => {
    const graphics = new GraphicsService();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    graphics.setSettings({ onionSky: true });
    expect(graphics.getSettings().onionSky).toBe(true);
    vi.restoreAllMocks();
  });
});
