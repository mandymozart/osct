import { describe, it, expect, beforeEach, vi } from "vitest";
import { LoadableStore } from "./LoadableStore";
import { Asset, ErrorCode } from "./types";

describe("LoadableStore", () => {
  let store: LoadableStore;

  beforeEach(() => {
    store = new LoadableStore();
  });

  describe("state management", () => {
    it("should initialize with empty state", () => {
      expect(store.state).toEqual({});
      expect(store.listeners).toEqual([]);
    });

    it("should update state and notify listeners", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.set({ test: "value" });

      expect(store.state).toEqual({ test: "value" });
      expect(listener).toHaveBeenCalledWith({ test: "value" });
    });
  });

  describe("subscription management", () => {
    it("should handle subscribe and unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      expect(store.listeners).toContain(listener);
      expect(listener).toHaveBeenCalledWith({});

      unsubscribe();
      expect(store.listeners).not.toContain(listener);
    });
  });

  describe("resource state management", () => {
    const testResource = { id: "1", src: "test.jpg" };

    it("should mark resource as loading", () => {
      const result = store.markAsLoading(testResource);
      expect(result).toEqual({
        ...testResource,
        isLoading: true,
        loaded: false,
        error: null,
      });
    });

    it("should mark resource as loaded", () => {
      const result = store.markAsLoaded(testResource);
      expect(result).toEqual({
        ...testResource,
        isLoading: false,
        loaded: true,
      });
    });

    it("should mark resource as failed", () => {
      const result = store.markAsFailed(
        testResource,
        ErrorCode.ASSET_LOAD_FAILED,
        "Test error"
      );
      expect(result).toEqual({
        ...testResource,
        isLoading: false,
        loaded: false,
        error: {
          code: ErrorCode.ASSET_LOAD_FAILED,
          msg: "Test error",
        },
      });
    });
  });

  describe("asset loading", () => {
    it("should load an image asset", async () => {
      const imgSrc = "test.jpg";

      // Start loading the asset
      const loadPromise = store.loadAsset(imgSrc, "image");

      // We need to wait for the next tick to allow the Image to be created
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Create and dispatch a load event on the most recently created Image
      const mockImage = document.createElement("img");
      const loadEvent = new Event("load");
      // @ts-ignore - accessing Image constructor's lastInstance
      Image.prototype._lastInstance?.onload?.(loadEvent);

      await expect(loadPromise).resolves.toBeUndefined();
    });

    it("should handle image loading errors", async () => {
      const imgSrc = "nonexistent.jpg";
      const loadPromise = store.loadAsset(imgSrc, "image");

      // We need to wait for the next tick to allow the Image to be created
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Trigger error event on the most recently created Image
      const errorEvent = new Event("error");
      // @ts-ignore - accessing Image constructor's lastInstance
      Image.prototype._lastInstance?.onerror?.(errorEvent);

      await expect(loadPromise).rejects.toThrow("Failed to load image");
    });

    it("should handle asset loading timeout", async () => {
      vi.useFakeTimers();
      const loadPromise = store.loadAsset("test.jpg");

      vi.advanceTimersByTime(31000);

      await expect(loadPromise).rejects.toThrow("Timeout loading asset");
      vi.useRealTimers();
    });
  });

  describe("multiple asset loading", () => {
    it("should load multiple assets in parallel", async () => {
      const assets: Asset[] = [
        {
          id: "1",
          src: "test1.jpg",
          type: "image",
          isLoading: false,
          loaded: false,
          error: null,
        },
        {
          id: "2",
          src: "test2.jpg",
          type: "image",
          isLoading: false,
          loaded: false,
          error: null,
        },
      ];

      const loadPromise = store.loadAssets(assets);

      // Wait for next tick to ensure all Image instances are created
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Get all created Image instances and trigger their load events
      const loadEvent = new Event("load");
      // @ts-ignore - accessing Image constructor's instances
      const instances = Image.prototype._instances || [];
      instances.forEach((img) => {
        img.onload?.(loadEvent);
      });

      const result = await loadPromise;
      expect(result).toHaveLength(2);
      expect(result[0].loaded).toBe(true);
      expect(result[1].loaded).toBe(true);
    });
  });
});
