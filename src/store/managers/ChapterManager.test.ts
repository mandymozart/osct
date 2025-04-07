import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ChapterManager } from "./ChapterManager";
import { mockChapters } from "./../../mocks/mockChapters";
import { ErrorCode, LoadingState } from "./../../types";
import { MockGame } from "../../mocks/mockGame";

// Create a mock ChapterApiService
const mockChapterApiService = {
  getChapters: vi.fn(),
  getChapter: vi.fn()
};

// Mock the ChapterApiService module
vi.mock("../../services/api/ChapterApiService", () => {
  return {
    ChapterApiService: {
      getInstance: () => mockChapterApiService
    }
  };
});

// Mock the assert function
vi.mock("../../utils/assert", () => ({
  assert: vi.fn((condition, message) => {
    if (!condition) throw new Error(message);
  })
}));

describe("ChapterManager", () => {
  let manager: ChapterManager;
  let mockGame: MockGame;

  beforeEach(() => {
    mockGame = new MockGame();
    manager = new ChapterManager(mockGame);
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("load", () => {
    it("should load chapters data and update loading state", async () => {
      // Setup API mock to return successful response
      mockChapterApiService.getChapters.mockResolvedValue({
        data: mockChapters,
        loading: false
      });

      await manager.load();

      // Verify loading states were set correctly
      expect(mockGame.set).toHaveBeenCalledWith({ loading: LoadingState.LOADING });
      expect(mockGame.set).toHaveBeenCalledWith({ loading: LoadingState.LOADED });
      
      // Verify API was called
      expect(mockChapterApiService.getChapters).toHaveBeenCalled();
    });

    it("should handle API errors and notify the user", async () => {
      // Setup API mock to return error
      mockChapterApiService.getChapters.mockResolvedValue({
        error: { code: ErrorCode.CHAPTERS_LOAD_FAILED, msg: "API error" },
        loading: false
      });

      await manager.load();

      // Verify error state was set
      expect(mockGame.set).toHaveBeenCalledWith({ loading: LoadingState.ERROR });
      
      // Verify error notification
      expect(mockGame.notifyError).toHaveBeenCalledWith({
        msg: "Failed to load chapters. Please try again later.",
        code: ErrorCode.CHAPTERS_LOAD_FAILED,
      });
    });
  });

  describe("getCachedChapter", () => {
    it("should return null for non-existent chapter", () => {
      const chapter = manager.getCachedChapter("non-existent");
      expect(chapter).toBeNull();
    });

    it("should return cached chapter", () => {
      const mockChapter = { ...mockChapters[0], loaded: true };
      mockGame.state.chapters = { chapter1: mockChapter };

      const chapter = manager.getCachedChapter("chapter1");
      expect(chapter).toEqual(mockChapter);
    });
  });

  describe("getCurrentChapter", () => {
    it("should return the current chapter from state", () => {
      const mockChapter = { ...mockChapters[0], loaded: true };
      mockGame.state.currentChapter = mockChapter;

      const chapter = manager.getCurrentChapter();
      expect(chapter).toEqual(mockChapter);
    });

    it("should return null when no current chapter exists", () => {
      mockGame.state.currentChapter = null;

      const chapter = manager.getCurrentChapter();
      expect(chapter).toBeNull();
    });
  });

  describe("switchChapter", () => {
    it("should not switch if current chapter is already loaded", async () => {
      const currentChapter = {
        ...mockChapters[0],
        loaded: true,
        isLoading: false,
        error: null,
      };
      mockGame.state.currentChapter = currentChapter;

      await manager.switchChapter("chapter1");
      expect(mockGame.set).not.toHaveBeenCalled();
    });

    it("should load from cache if available", async () => {
      const cachedChapter = {
        ...mockChapters[0],
        loaded: true,
        isLoading: false,
        error: null,
      };
      mockGame.state.chapters = { chapter1: cachedChapter };

      await manager.switchChapter("chapter1");
      expect(mockGame.set).toHaveBeenCalledWith({
        currentChapter: cachedChapter,
      });
    });

    it("should handle non-existent chapter and notify error", async () => {
      // Set up data in the manager
      // @ts-ignore - Accessing private property for testing
      manager.data = mockChapters;

      try {
        await manager.switchChapter("non-existent");
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify error notification
      expect(mockGame.notifyError).toHaveBeenCalledWith({
        msg: "Chapter non-existent not found.",
        code: ErrorCode.CHAPTER_NOT_FOUND,
      });

      expect(mockGame.markAsFailed).toHaveBeenCalledWith(
        { id: "non-existent" },
        ErrorCode.CHAPTER_NOT_FOUND,
        "Chapter non-existent not found."
      );
    });

    it("should initialize and load new chapter", async () => {
      // Set up data in the manager
      // @ts-ignore - Accessing private property for testing
      manager.data = mockChapters;
      
      // Mock successful asset loading
      mockGame.loadAssets = vi.fn().mockResolvedValue([
        {
          src: "test.gltf",
          loaded: true,
          error: null,
          isLoading: false,
        },
      ]);

      await manager.switchChapter("chapter1");

      // Verify chapter was set to loading state
      expect(mockGame.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currentChapter: expect.objectContaining({
            id: "chapter1",
            isLoading: true,
          }),
        })
      );
    });
    // TODO: Add tests for asset loading errors
  });
});
