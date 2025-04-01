import { describe, it, expect, beforeEach, vi } from "vitest";
import { createGameStore } from "./GameStore";
import { mockChapters } from "./../mocks/mockChapters";
import { GameStore } from "./types";

describe("GameStore", () => {
  let store: GameStore;

  beforeEach(() => {
    store = createGameStore();
  });

  describe("scene management", () => {
    it("should handle scene setting and getting", () => {
        store.initialize({version: "1.0.0", chapters: mockChapters});
      const mockScene = { id: "test-scene" };
      expect(store.getScene()).toBeNull();

      store.setScene(mockScene);
      expect(store.getScene()).toEqual(mockScene);
    });
  });

  describe("target tracking", () => {
    beforeEach(() => {
      store["state"].currentChapter = mockChapters[0];
    });

    it("should track and untrack targets", () => {
      store.addTarget(0);
      expect(store.getTrackedTargets()).toContain(0);

      store.removeTarget(0);
      expect(store.getTrackedTargets()).not.toContain(0);
    });

    it("should get tracked target objects", () => {
      store.addTarget(0);
      const trackedObjects = store.getTrackedTargetObjects();

      expect(trackedObjects).toHaveLength(1);
      expect(trackedObjects[0]).toEqual(mockChapters[0].targets[0]);
      expect(trackedObjects[0].title).toBe("Bear");
      expect(trackedObjects[0].isLoading).toBeDefined();
      expect(trackedObjects[0].loaded).toBeDefined();
      expect(trackedObjects[0].error).toBeNull();
    });

    it("should mark target as seen when tracked", () => {
      store.addTarget(0);
      expect(store.hasTargetBeenSeen(mockChapters[0].id, 0)).toBe(true);
    });
  });

  describe("chapter management", () => {
    beforeEach(() => {
      store["state"].cachedChapters = {
        chapter1: mockChapters[0],
        chapter2: mockChapters[1],
      };
    });

    it("should get cached chapter", () => {
      const chapter = store.getCachedChapter("chapter1");
      console.log(
        "chapter",
        chapter,
        "store.cachedChapters",
        store["state"].cachedChapters
      );
      expect(chapter).toBeDefined();
      expect(chapter?.id).toBe("chapter1");
      expect(chapter?.title).toBe("The Beginning");
    });

    it("should return null for non-existent chapter", () => {
      const chapter = store.getCachedChapter("non-existent");
      expect(chapter).toBeNull();
    });

    it("should switch chapters", () => {
      const expectedChapter = { ...mockChapters[1] };
      store.switchChapter("chapter2");
      expect(store["state"].currentChapter).toBeDefined();
      expect(store["state"].currentChapter?.id).toBe("chapter2");
      expect(store["state"].currentChapter?.title).toBe("The Castle Gates");
    });
  });

  describe("target history", () => {
    beforeEach(() => {
      store.resetAllHistory();
      store["state"].cachedChapters = {
        chapter1: mockChapters[0],
      };
    });

    it("should calculate chapter completion 50%", () => {
      store.markTargetAsSeen("chapter1", 0);
      expect(store.getChapterCompletionPercentage("chapter1")).toBe(50);
    });

    it("should track seen targets", () => {
      store.markTargetAsSeen("chapter1", 0);
      expect(store.hasTargetBeenSeen("chapter1", 0)).toBe(true);
      expect(store.hasTargetBeenSeen("chapter1", 1)).toBe(false);
    });

    it("should reset chapter history", () => {
      store.markTargetAsSeen("chapter1", 0);
      store.resetChapterHistory("chapter1");
      expect(store.hasTargetBeenSeen("chapter1", 0)).toBe(false);
    });

    it("should reset all history", () => {
      store.markTargetAsSeen("chapter1", 0);
      store.markTargetAsSeen("chapter2", 0);
      store.resetAllHistory();
      expect(store.hasTargetBeenSeen("chapter1", 0)).toBe(false);
      expect(store.hasTargetBeenSeen("chapter2", 0)).toBe(false);
    });

    it("should get seen targets for chapter", () => {
      store.markTargetAsSeen("chapter1", 0);
      store.markTargetAsSeen("chapter1", 1);
      const seenTargets = store.getSeenTargetsForChapter("chapter1");
      expect(seenTargets).toEqual([0, 1]);
    });

    it("should check if chapter is complete", () => {
      // Verify initial state
      const seenTargets = store.getSeenTargetsForChapter("chapter1");
      expect(seenTargets).toHaveLength(0);
      expect(store.isChapterComplete("chapter1")).toBe(false);

      // Mark all targets as seen
      store.markTargetAsSeen("chapter1", 0); // Bear
      store.markTargetAsSeen("chapter1", 1); // Ancient Tree

      // Verify completion
      expect(store.getSeenTargetsForChapter("chapter1")).toHaveLength(2);
      expect(store.isChapterComplete("chapter1")).toBe(true);
    });
  });

});
