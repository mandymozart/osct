import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChapterManager } from "./ChapterManager";
import { mockChapters } from "./../../mocks/mockChapters";
import { Chapter, ErrorCode, LoadableResource } from "./../types";
import { LoadableStore } from "../LoadableStore";

// Mock the chapters import
vi.mock("./../../data/chapters", () => ({
  chapters: mockChapters,
}));

class MockLoadableStore extends LoadableStore {
  constructor() {
    super();
    this.state = {
      currentChapter: null,
      cachedChapters: {},
      trackedTargets: [],
    };
  }

  set = vi.fn((state: Partial<any>) => {
    this.state = { ...this.state, ...state };
    this.notifyListeners();
  });

  markAsLoading = vi.fn(
    <T extends LoadableResource>(resource: T): T => ({
      ...resource,
      isLoading: true,
      loaded: false,
      error: null,
    })
  );

  markAsFailed = vi.fn(
    <T extends LoadableResource>(
      resource: T,
      code: ErrorCode,
      msg: string
    ): T => ({
      ...resource,
      isLoading: false,
      loaded: false,
      error: { code, msg },
    })
  );

  markAsLoaded = vi.fn(
    <T extends LoadableResource>(resource: T): T => ({
      ...resource,
      isLoading: false,
      loaded: true,
      error: null,
    })
  );

  loadAssets = vi.fn().mockResolvedValue([]);

  notifyListeners = vi.fn();
}

describe("ChapterManager", () => {
  let manager: ChapterManager;
  let mockStore: MockLoadableStore;

  beforeEach(() => {
    mockStore = new MockLoadableStore();
    manager = new ChapterManager(mockStore);
  });

  describe("getCachedChapter", () => {
    it("should return null for non-existent chapter", () => {
      const chapter = manager.getCachedChapter("non-existent");
      expect(chapter).toBeNull();
    });

    it("should return cached chapter", () => {
      const mockChapter = { ...mockChapters[0], loaded: true };
      mockStore.state.cachedChapters = { chapter1: mockChapter };

      const chapter = manager.getCachedChapter("chapter1");
      expect(chapter).toEqual(mockChapter);
    });
  });

  describe("switchChapter", () => {
    it("should not switch if current chapter is already loaded", () => {
      const currentChapter = {
        ...mockChapters[0],
        loaded: true,
        isLoading: false,
        error: null,
      };
      mockStore.state.currentChapter = currentChapter;

      manager.switchChapter("chapter1");
      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it("should load from cache if available", () => {
      const cachedChapter = {
        ...mockChapters[0],
        loaded: true,
        isLoading: false,
        error: null,
      };
      mockStore.state.cachedChapters = { chapter1: cachedChapter };

      manager.switchChapter("chapter1");
      expect(mockStore.set).toHaveBeenCalledWith({
        currentChapter: cachedChapter,
      });
    });

    it("should handle non-existent chapter", () => {
      manager.switchChapter("non-existent");

      expect(mockStore.markAsFailed).toHaveBeenCalledWith(
        { id: "non-existent" },
        ErrorCode.CHAPTER_NOT_FOUND,
        "Chapter non-existent not found."
      );
    });

    it("should initialize and load new chapter", async () => {
      mockStore.loadAssets.mockResolvedValueOnce([
        {
          src: "test.gltf",
          loaded: true,
          error: null,
          isLoading: false,
        },
      ]);

      manager.switchChapter("chapter1");

      expect(mockStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currentChapter: expect.objectContaining({
            id: "chapter1",
            isLoading: true,
          }),
        })
      );
    });

    it("should handle asset loading errors", async () => {
      mockStore.loadAssets.mockRejectedValueOnce(
        new Error("Asset load failed")
      );

      manager.switchChapter("chapter1");

      expect(mockStore.markAsFailed).toHaveBeenCalledWith(
        expect.objectContaining({ id: "chapter1" }),
        ErrorCode.UNKNOWN_ERROR,
        "Asset load failed"
      );
    });
  });
});
