import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameStore } from "@/store/GameStore";
import { LocalProgressStorage } from "@/services/ProgressStorage";
import { getExperience, getInitialSceneId, getScenes } from "@/utils/game-config";

const [first, second] = getScenes().map(scene => scene.id);

describe("SceneManager", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("starts on the content's initial scene", () => {
    expect(createGameStore().state.currentScene).toBe(getInitialSceneId());
  });

  it("switches to a scene of the content and tells the subscribers once", () => {
    const game = createGameStore();
    const target = getInitialSceneId() === second ? first : second;
    const seen: Array<string | null> = [];
    game.subscribeToProperty("currentScene", id => seen.push(id));
    game.scenes.switchScene(target);
    expect(game.state.currentScene).toBe(target);
    game.scenes.switchScene(target);
    expect(seen).toEqual([target]);
  });

  it("ignores a scene the content does not have", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const game = createGameStore();
    const before = game.state.currentScene;
    game.scenes.switchScene("no-such-scene");
    expect(game.state.currentScene).toBe(before);
    expect(error).toHaveBeenCalledWith('[SceneManager] "no-such-scene" not found in configuration');
  });

  it("a switch is the reader's last scene in the progress", () => {
    const game = createGameStore();
    const target = getInitialSceneId() === second ? first : second;
    game.scenes.switchScene(target);
    expect(game.state.progress.lastScene).toBe(target);
    const stored = JSON.parse(localStorage.getItem(LocalProgressStorage.key(getExperience().id)) ?? "null");
    expect(stored.lastScene).toBe(target);
  });

  it("a new store resumes on the stored last scene", () => {
    const target = getInitialSceneId() === second ? first : second;
    createGameStore().scenes.switchScene(target);
    expect(createGameStore().state.currentScene).toBe(target);
  });
});
