import { Scene } from "aframe";

/**
 * Interface for the SceneService which manages the A-Frame scene
 */
export interface ISceneService {
  /**
   * Get the current A-Frame scene instance
   * @returns The A-Frame scene instance or null if not set
   */
  getScene(): Scene | null;

  /**
   * Set the A-Frame scene instance
   * @param scene The A-Frame scene to set
   */
  setScene(scene: Scene | null): void;

  /**
   * Register a callback for when the scene becomes available
   * @param callback Function to call when scene is ready
   * @returns Cleanup function to unregister the callback
   */
  onSceneReady(callback: (scene: Scene) => void): () => void;
  
  /**
   * Register a callback for when the scene changes
   * This will be called whenever a new scene is set and is different from the previous scene
   * @param callback Function to call when scene changes
   * @returns Cleanup function to unregister the callback
   */
  onSceneChanged(callback: (scene: Scene) => void): () => void;
}
/**
 * What the A-Frame scene / MindAR should be doing. Derived from the game mode and the current
 * route (`aframe-bridges/utils/scene-state.ts`), applied by the scene bridge. Ordered from least to most active.
 * STOPPED: camera released · PAUSED: tracking + video paused, camera stream kept (instant resume,
 * last frame frozen behind the UI) · RUNNING: camera, tracking and rendering.
 */
export enum SceneState {
  STOPPED = 0,
  PAUSED = 1,
  RUNNING = 2,
}
