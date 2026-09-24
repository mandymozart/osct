import { beforeEach, describe, expect, it } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { IGame, Pages } from "@/types";
import { getChapters, getTargets } from "@/utils/config";

const HISTORY_KEY = "ar-game-target-history";

describe("HistoryManager", () => {
  let game: IGame;
  const chapterId = getChapters()[0].id;
  const targetCount = getTargets(chapterId).length;

  beforeEach(() => {
    localStorage.clear();
    game = createGameStore();
  });

  it("marks a target as seen once and persists it", () => {
    game.history.markTargetAsSeen(chapterId, 0);
    game.history.markTargetAsSeen(chapterId, 0);

    expect(game.state.history).toHaveLength(1);
    expect(game.history.hasTargetBeenSeen(chapterId, 0)).toBe(true);
    expect(game.history.hasTargetBeenSeen(chapterId, 1)).toBe(false);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(1);
  });

  it("computes completion per chapter", () => {
    expect(game.history.getChapterCompletionPercentage(chapterId)).toBe(0);

    for (let i = 0; i < targetCount; i++) game.history.markTargetAsSeen(chapterId, i);

    expect(game.history.getChapterCompletionPercentage(chapterId)).toBe(100);
    expect(game.history.isChapterComplete(chapterId)).toBe(true);
  });

  it("resets one chapter without touching others", () => {
    game.history.markTargetAsSeen(chapterId, 0);
    game.history.markTargetAsSeen("other", 0);

    game.history.resetChapterHistory(chapterId);

    expect(game.history.getSeenTargetsForChapter(chapterId)).toEqual([]);
    expect(game.history.getSeenTargetsForChapter("other")).toEqual([0]);
  });

  it("restores history from storage and offers to resume", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      { chapterId, targetIndex: 0, timestamp: 1 },
    ]));

    game.history.load();

    expect(game.history.hasTargetBeenSeen(chapterId, 0)).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.ERROR);
    expect(game.state.currentError?.msg).toContain("previous session");
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(HISTORY_KEY, "{not json");
    expect(() => game.history.load()).not.toThrow();
    expect(game.state.history).toEqual([]);
  });
});

describe("TargetManager", () => {
  let game: IGame;
  const chapterId = getChapters()[0].id;

  beforeEach(() => {
    localStorage.clear();
    game = createGameStore();
    game.chapters.switchChapter(chapterId);
  });

  it("tracks a found target once and marks it seen in the current chapter", () => {
    game.targets.addTarget(1);
    game.targets.addTarget(1);

    expect(game.targets.getTrackedTargets()).toEqual([1]);
    expect(game.history.hasTargetBeenSeen(chapterId, 1)).toBe(true);
  });

  it("keeps history when a target is lost", () => {
    game.targets.addTarget(1);
    game.targets.removeTarget(1);

    expect(game.targets.getTrackedTargets()).toEqual([]);
    expect(game.history.hasTargetBeenSeen(chapterId, 1)).toBe(true);
  });
});
