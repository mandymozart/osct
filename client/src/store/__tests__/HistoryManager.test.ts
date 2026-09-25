import { beforeEach, describe, expect, it } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { PROGRESS_FORMAT, PROGRESS_READERS, readProgress } from "@/utils";
import { LocalProgressStorage } from "@/services/ProgressStorage";
import { EntryCategory, IGame, Pages, ProgressRecord } from "@/types";
import { getBook, getEntries, getSpreads, getTargets } from "@/utils/game-config";

const bookId = getBook().id;
const PROGRESS_KEY = LocalProgressStorage.key(bookId);

const stored = (): ProgressRecord => JSON.parse(localStorage.getItem(PROGRESS_KEY)!);

describe("HistoryManager (progress)", () => {
  let game: IGame;
  const spreadId = getSpreads()[0].id;
  const targets = getTargets(spreadId);
  const entryId = getEntries()[0].id;

  beforeEach(() => {
    localStorage.clear();
    game = createGameStore();
  });

  it("starts with an empty record of the current format and app version", () => {
    expect(game.state.progress).toMatchObject({
      format: PROGRESS_FORMAT,
      bookId,
      appVersions: [__VITE_APP_VERSION__],
      unlocked: {},
      consulted: {},
      lastSpreadId: null,
    });
    expect(stored().appVersions).toEqual([__VITE_APP_VERSION__]);
  });

  it("unlocks a target once by id and persists it", () => {
    game.history.unlockTarget(targets[0].id);
    const time = game.state.progress.unlocked[targets[0].id];
    game.history.unlockTarget(targets[0].id);

    expect(game.history.isUnlocked(targets[0].id)).toBe(true);
    expect(game.history.isUnlocked(targets[1].id)).toBe(false);
    expect(stored().unlocked).toEqual({ [targets[0].id]: time });
  });

  it("consults entries (second stage) independently of unlocking", () => {
    game.history.consultEntry(entryId);
    expect(game.history.isConsulted(entryId)).toBe(true);
    expect(stored().consulted).toHaveProperty(entryId);
  });

  it("records the last spread and category", () => {
    const other = getSpreads()[1].id;
    game.spreads.switchSpread(other);
    game.history.setLastCategory(EntryCategory.Text);
    expect(stored()).toMatchObject({ lastSpreadId: other, lastCategory: "text" });
  });

  it("computes completion per spread from unlocked targets", () => {
    expect(game.history.getSpreadCompletionPercentage(spreadId)).toBe(0);
    targets.forEach(t => game.history.unlockTarget(t.id));
    expect(game.history.getUnlockedTargets(spreadId)).toEqual(targets.map(t => t.id));
    expect(game.history.isSpreadComplete(spreadId)).toBe(true);
  });

  it("keeps ids that are no longer in the content", () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      format: PROGRESS_FORMAT, bookId, appVersions: [__VITE_APP_VERSION__],
      unlocked: { "removed-target": 1 }, consulted: { "removed-entry": 2 },
    }));
    game = createGameStore();
    expect(game.state.progress.unlocked).toEqual({ "removed-target": 1 });
    expect(game.state.progress.consulted).toEqual({ "removed-entry": 2 });
    expect(game.history.getUnlockedTargets(spreadId)).toEqual([]);
    expect(game.history.getMissingIds()).toEqual({ targets: ["removed-target"], entries: ["removed-entry"] });
    expect(game.history.getConsultedCount()).toBe(0); // the counter only counts content entries
  });

  it("reports no missing ids for content ids", () => {
    game.history.unlockTarget(targets[0].id);
    game.history.consultEntry(entryId);
    game.history.consultEntry("gone");
    expect(game.history.getMissingIds()).toEqual({ targets: [], entries: ["gone"] });
  });

  it("remembers that the onboarding was finished or skipped", () => {
    expect(game.state.progress.onboarded).toBe(false);
    game.history.setOnboarded();
    expect(stored().onboarded).toBe(true);
  });

  it("resets the progress but keeps the app version history", () => {
    game.history.unlockTarget(targets[0].id);
    game.history.reset();
    expect(game.state.progress.unlocked).toEqual({});
    expect(stored().appVersions).toEqual([__VITE_APP_VERSION__]);
  });

  describe("resume offer", () => {
    it("offers to resume the spread of the last unlocked target", () => {
      game.history.unlockTarget(targets[0].id);
      game = createGameStore();
      game.history.offerResume();

      expect(game.state.currentRoute?.page).toBe(Pages.ERROR);
      expect(game.state.currentError?.msg).toContain("previous session");
      expect(game.state.currentError?.action?.text).toBe("Resume");
    });

    it("says nothing without a previous session", () => {
      game.history.offerResume();
      expect(game.state.currentError).toBeNull();
    });
  });

  describe("reading stored formats", () => {
    it("treats corrupt storage as unreadable and tells the user", () => {
      localStorage.setItem(PROGRESS_KEY, "{not json");
      game = createGameStore();
      game.history.offerResume();
      expect(game.state.progress.unlocked).toEqual({});
      expect(game.state.currentError?.msg).toContain("could not be read");
    });

    // Stand-in for the reader a MAJOR bump adds for the previous format
    it("converts an older format, saves it in the current one and tells the user with the resume offer", () => {
      const oldFormat = PROGRESS_FORMAT - 1;
      PROGRESS_READERS[oldFormat] = (raw, id) => ({
        ...readProgress({ format: PROGRESS_FORMAT }, id).record,
        unlocked: raw.found as Record<string, number>,
        lastSpreadId: spreadId,
        appVersions: ["0.9.0"],
      });
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({ format: oldFormat, found: { [targets[0].id]: 5 } }));
        game = createGameStore();
        expect(stored()).toMatchObject({
          format: PROGRESS_FORMAT,
          unlocked: { [targets[0].id]: 5 },
          appVersions: ["0.9.0", __VITE_APP_VERSION__],
        });

        game.history.offerResume();
        expect(game.state.currentError?.msg).toContain("updated to the new app format");
        expect(game.state.currentError?.msg).toContain("previous session");
      } finally {
        delete PROGRESS_READERS[oldFormat];
      }
    });
  });
});

describe("TargetManager", () => {
  let game: IGame;
  const spreadId = getSpreads()[0].id;
  const target = getTargets(spreadId)[1];

  beforeEach(() => {
    localStorage.clear();
    game = createGameStore();
    game.spreads.switchSpread(spreadId);
  });

  it("tracks a found target by id once and unlocks it", () => {
    game.targets.addTarget(target.id);
    game.targets.addTarget(target.id);

    expect(game.targets.getTrackedTargets()).toEqual([target.id]);
    expect(game.history.isUnlocked(target.id)).toBe(true);
  });

  it("keeps the progress when a target is lost", () => {
    game.targets.addTarget(target.id);
    game.targets.removeTarget(target.id);

    expect(game.targets.getTrackedTargets()).toEqual([]);
    expect(game.history.isUnlocked(target.id)).toBe(true);
  });

  it("ignores unknown targets in the progress", () => {
    game.targets.addTarget("not-a-target");
    expect(game.state.progress.unlocked).toEqual({});
  });
});
