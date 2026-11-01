import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { LocalProgressStorage } from "@/services/ProgressStorage";
import { getBook, getInitialSpreadId, getSpreads } from "@/utils/game-config";

const [first, second] = getSpreads().map(spread => spread.id);

describe("SpreadManager", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("starts on the content's initial spread", () => {
    expect(createGameStore().state.currentSpread).toBe(getInitialSpreadId());
  });

  it("switches to a spread of the content and tells the subscribers once", () => {
    const game = createGameStore();
    const target = getInitialSpreadId() === second ? first : second;
    const seen: Array<string | null> = [];
    game.subscribeToProperty("currentSpread", id => seen.push(id));
    game.spreads.switchSpread(target);
    expect(game.state.currentSpread).toBe(target);
    game.spreads.switchSpread(target);
    expect(seen).toEqual([target]);
  });

  it("ignores a spread the content does not have", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const game = createGameStore();
    const before = game.state.currentSpread;
    game.spreads.switchSpread("no-such-spread");
    expect(game.state.currentSpread).toBe(before);
    expect(error).toHaveBeenCalledWith('[SpreadManager] "no-such-spread" not found in configuration');
  });

  it("a switch is the reader's last spread in the progress", () => {
    const game = createGameStore();
    const target = getInitialSpreadId() === second ? first : second;
    game.spreads.switchSpread(target);
    expect(game.state.progress.lastSpreadId).toBe(target);
    const stored = JSON.parse(localStorage.getItem(LocalProgressStorage.key(getBook().id)) ?? "null");
    expect(stored.lastSpreadId).toBe(target);
  });

  it("a new store resumes on the stored last spread", () => {
    const target = getInitialSpreadId() === second ? first : second;
    createGameStore().spreads.switchSpread(target);
    expect(createGameStore().state.currentSpread).toBe(target);
  });
});
