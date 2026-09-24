import { beforeEach, describe, expect, it } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { IGame, Pages } from "@/types";
import { getSpreads, getTargets } from "@/utils/game-config";

const HISTORY_KEY = "ar-game-target-history";

describe("HistoryManager", () => {
  let game: IGame;
  const spreadId = getSpreads()[0].id;
  const targetCount = getTargets(spreadId).length;

  beforeEach(() => {
    localStorage.clear();
    game = createGameStore();
  });

  it("marks a target as seen once and persists it", () => {
    game.history.markTargetAsSeen(spreadId, 0);
    game.history.markTargetAsSeen(spreadId, 0);

    expect(game.state.history).toHaveLength(1);
    expect(game.history.hasTargetBeenSeen(spreadId, 0)).toBe(true);
    expect(game.history.hasTargetBeenSeen(spreadId, 1)).toBe(false);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(1);
  });

  it("computes completion per spread", () => {
    expect(game.history.getSpreadCompletionPercentage(spreadId)).toBe(0);

    for (let i = 0; i < targetCount; i++) game.history.markTargetAsSeen(spreadId, i);

    expect(game.history.getSpreadCompletionPercentage(spreadId)).toBe(100);
    expect(game.history.isSpreadComplete(spreadId)).toBe(true);
  });

  it("resets one spread without touching others", () => {
    game.history.markTargetAsSeen(spreadId, 0);
    game.history.markTargetAsSeen("other", 0);

    game.history.resetSpreadHistory(spreadId);

    expect(game.history.getSeenTargetsForSpread(spreadId)).toEqual([]);
    expect(game.history.getSeenTargetsForSpread("other")).toEqual([0]);
  });

  it("restores history from storage and offers to resume", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      { spreadId, targetIndex: 0, timestamp: 1 },
    ]));

    game.history.load();

    expect(game.history.hasTargetBeenSeen(spreadId, 0)).toBe(true);
    expect(game.state.currentRoute?.page).toBe(Pages.ERROR);
    expect(game.state.currentError?.msg).toContain("previous session");
  });

  it("drops stored entries of unknown spreads (e.g. pre-rename chapterId entries)", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      { chapterId: "chapter1", targetIndex: 0, timestamp: 2 },
      { spreadId: "removed-spread", targetIndex: 0, timestamp: 3 },
      { spreadId, targetIndex: 1, timestamp: 1 },
    ]));

    game.history.load();

    expect(game.state.history).toEqual([{ spreadId, targetIndex: 1, timestamp: 1 }]);
    expect(game.state.currentError?.msg).not.toContain("undefined");
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(HISTORY_KEY, "{not json");
    expect(() => game.history.load()).not.toThrow();
    expect(game.state.history).toEqual([]);
  });
});

describe("TargetManager", () => {
  let game: IGame;
  const spreadId = getSpreads()[0].id;

  beforeEach(() => {
    localStorage.clear();
    game = createGameStore();
    game.spreads.switchSpread(spreadId);
  });

  it("tracks a found target once and marks it seen in the current spread", () => {
    game.targets.addTarget(1);
    game.targets.addTarget(1);

    expect(game.targets.getTrackedTargets()).toEqual([1]);
    expect(game.history.hasTargetBeenSeen(spreadId, 1)).toBe(true);
  });

  it("keeps history when a target is lost", () => {
    game.targets.addTarget(1);
    game.targets.removeTarget(1);

    expect(game.targets.getTrackedTargets()).toEqual([]);
    expect(game.history.hasTargetBeenSeen(spreadId, 1)).toBe(true);
  });
});
