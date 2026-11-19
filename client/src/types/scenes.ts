export interface ISceneManager {
  switchScene(id: string): void;
}

export interface SceneManagerState {
  currentScene: string | null;
}
