import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { CameraPermissionStatus, ErrorCode, GameMode, LoadingState } from "@/types";
import { getBook, getInitialSpreadId } from "@/utils/game-config";

describe("GameStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("starts idle and loading, on the initial spread, with this book's progress", () => {
    const game = createGameStore();
    expect(game.state).toMatchObject({
      mode: GameMode.IDLE,
      currentRoute: null,
      currentError: null,
      trackedTargets: [],
      currentSpread: getInitialSpreadId(),
      loading: LoadingState.LOADING,
      arStatus: "idle",
      cameraPermission: CameraPermissionStatus.UNKNOWN,
    });
    expect(game.state.progress.bookId).toBe(getBook().id);
    expect(game.state.progress.appVersions.at(-1)).toBe(__VITE_APP_VERSION__);
  });

  it("carries the app version", () => {
    expect(createGameStore().version.version).toBe(__VITE_APP_VERSION__);
  });

  it("has every manager", () => {
    const game = createGameStore();
    for (const manager of [game.spreads, game.targets, game.history, game.router, game.camera]) expect(manager).toBeDefined();
  });

  it("each store has its own state", () => {
    const a = createGameStore();
    const b = createGameStore();
    a.finishLoading();
    expect(b.state.loading).toBe(LoadingState.LOADING);
  });

  it("finishes and starts loading", () => {
    const game = createGameStore();
    game.finishLoading();
    expect(game.state.loading).toBe(LoadingState.LOADED);
    game.startLoading();
    expect(game.state.loading).toBe(LoadingState.LOADING);
  });

  it("reports the AR status only when it changes", () => {
    const game = createGameStore();
    const seen = vi.fn();
    game.subscribeToProperty("arStatus", seen);
    game.setArStatus("running");
    game.setArStatus("running");
    expect(game.state.arStatus).toBe("running");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("an error shows the overlay route and reaches every error listener until it unsubscribes", () => {
    const game = createGameStore();
    const listener = vi.fn();
    const stop = game.onError(listener);
    const error = { code: ErrorCode.NOT_FOUND, msg: "Nothing here" };
    game.notifyError(error);
    expect(game.state.currentError).toEqual(error);
    expect(game.state.currentRoute?.page).toBe("error");
    expect(listener).toHaveBeenCalledWith(error);
    expect(console.error).toHaveBeenCalledWith(`[Game] Error: Nothing here (${ErrorCode.NOT_FOUND})`);

    stop();
    stop(); // a second call removes nothing else
    game.notifyError({ code: ErrorCode.NOT_FOUND, msg: "Again" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("an unsubscribed error listener leaves the others", () => {
    const game = createGameStore();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = game.onError(a);
    game.onError(b);
    stopA();
    game.notifyError({ code: ErrorCode.NOT_FOUND, msg: "x" });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
